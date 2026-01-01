import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { code, state, userToken } = body;

    if (!code) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing authorization code' }),
      };
    }

    if (!userToken) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'User authentication required' }),
      };
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Spotify token exchange failed:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to exchange authorization code' }),
      };
    }

    const tokens = await tokenResponse.json();

    // Create Supabase admin client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user token
    const { data: { user }, error: userError } = await supabase.auth.getUser(userToken);

    if (userError || !user) {
      console.error('Failed to verify user:', userError);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid user token' }),
      };
    }

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Store credentials using service role
    const { error: credError } = await supabase
      .from('spotify_credentials')
      .upsert({
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        scope: tokens.scope,
      });

    if (credError) {
      console.error('Failed to store Spotify credentials:', credError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to store credentials' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Spotify connected successfully',
      }),
    };
  } catch (error) {
    console.error('Error in Spotify callback:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
