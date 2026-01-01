import { Handler } from '@netlify/functions';

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || '';

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REDIRECT_URI) {
      console.error('Missing Spotify environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Spotify configuration missing' }),
      };
    }

    // Generate random state for CSRF protection
    const state = Math.random().toString(36).substring(2, 15);

    // Minimal scopes - we only need basic artist search capability
    // user-read-email is optional for identity verification
    const scopes = 'user-read-email';

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('client_id', SPOTIFY_CLIENT_ID);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', SPOTIFY_REDIRECT_URI);
    authUrl.searchParams.append('scope', scopes);
    authUrl.searchParams.append('state', state);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        authUrl: authUrl.toString(),
        state,
      }),
    };
  } catch (error) {
    console.error('Error starting Spotify auth:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to start Spotify authentication' }),
    };
  }
};
