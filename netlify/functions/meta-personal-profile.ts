import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify(data),
  };
}

/**
 * Fetches the personal Facebook profile of the connected user
 * Returns: { id, name, pictureUrl }
 */
export const handler: Handler = async (event) => {
  console.log('[meta-personal-profile] Request received:', event.httpMethod);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    // 1. Verify authentication
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[meta-personal-profile] Missing auth header');
      return jsonResponse(401, { error: 'MISSING_AUTH' });
    }

    const jwt = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      console.error('[meta-personal-profile] Auth error:', userError);
      return jsonResponse(401, { error: 'INVALID_USER' });
    }

    console.log('[meta-personal-profile] User verified:', user.id.substring(0, 8) + '...');

    // 2. Get Meta access token from meta_credentials (canonical source)
    const { data: conn, error: connError } = await supabase
      .from('meta_credentials')
      .select('access_token, token_expires_at')
      .eq('user_id', user.id)
      .maybeSingle();

    // Safe debug logging
    const debugInfo = {
      row_found: !!conn,
      token_present: !!conn?.access_token,
      token_len: conn?.access_token?.length || 0,
      token_field: conn?.access_token ? 'access_token' : null,
    };
    console.log('[meta-personal-profile] Connection debug:', debugInfo);

    if (connError) {
      console.error('[meta-personal-profile] Database error:', connError);
      return jsonResponse(500, { error: 'DATABASE_ERROR' });
    }

    if (!conn?.access_token) {
      console.warn('[meta-personal-profile] No token found for user:', user.id);
      return jsonResponse(401, {
        error: 'NOT_CONNECTED',
        message: 'No Meta connection found. Please connect your Meta account.',
        debug: debugInfo,
      });
    }

    console.log('[meta-personal-profile] Fetching personal profile from Meta');

    // 3. Fetch personal profile from Meta Graph API
    const res = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id,name,picture&access_token=${encodeURIComponent(
        conn.access_token
      )}`
    );

    const data = await res.json();

    // Check for OAuth 190 error (token invalid/expired)
    if (data.error) {
      const errorCode = data.error.code;
      const errorMessage = data.error.message || 'Unknown error';

      console.error('[meta-personal-profile] Meta API error:', errorCode, errorMessage);

      // OAuth error 190: Token invalid/expired
      if (errorCode === 190 || errorMessage.includes('Error validating access token') || errorMessage.includes('session has been invalidated')) {
        console.log('[meta-personal-profile] OAuth token invalid, clearing token');

        // Clear the invalid token
        await supabase
          .from('meta_credentials')
          .update({ access_token: null, token_expires_at: null })
          .eq('user_id', user.id);

        return jsonResponse(401, {
          error: 'NEEDS_RECONNECT',
          message: 'Meta session invalidated. Please reconnect your Meta account.',
          details: errorMessage,
        });
      }

      return jsonResponse(502, {
        error: 'META_API_ERROR',
        code: errorCode,
        details: errorMessage,
      });
    }

    if (!res.ok) {
      console.error('[meta-personal-profile] Meta API HTTP error:', res.status);
      return jsonResponse(502, {
        error: 'META_API_ERROR',
        status: res.status,
      });
    }

    if (!data.id) {
      console.error('[meta-personal-profile] Invalid response:', data);
      return jsonResponse(502, { error: 'INVALID_RESPONSE' });
    }

    console.log('[meta-personal-profile] Profile fetched:', data.id, data.name);

    // 4. Return profile data
    return jsonResponse(200, {
      id: data.id,
      name: data.name || 'Facebook User',
      pictureUrl: data.picture?.data?.url || null,
    });
  } catch (err: any) {
    console.error('[meta-personal-profile] Unexpected error:', err);
    return jsonResponse(500, {
      error: 'SERVER_ERROR',
      details: err?.message || String(err),
    });
  }
};
