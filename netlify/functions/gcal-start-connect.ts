/**
 * Google Calendar Connect - Start OAuth Flow
 *
 * Returns Google OAuth URL with calendar scopes
 * Does NOT touch regular Google login/auth flow
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_ID, GOOGLE_OAUTH_REDIRECT_URL } = process.env;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const handler: Handler = async (event) => {
  try {
    const authHeader = event.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not authenticated' }),
      };
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid user' }),
      };
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_OAUTH_REDIRECT_URL) {
      console.error('[gcal-start-connect] Missing GOOGLE_CLIENT_ID or GOOGLE_OAUTH_REDIRECT_URL');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Google Calendar is not configured' }),
      };
    }

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ];

    // Pass user_id in state so we can retrieve it in callback
    const state = JSON.stringify({ user_id: user.id });

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_OAUTH_REDIRECT_URL,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: scopes.join(' '),
      state,
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    console.log('[gcal-start-connect] Generated OAuth URL for user:', user.id);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    };
  } catch (err: any) {
    console.error('[gcal-start-connect] Error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal error', details: err.message }),
    };
  }
};

export { handler };
