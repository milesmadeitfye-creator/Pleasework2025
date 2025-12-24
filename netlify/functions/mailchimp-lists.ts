import type { Handler } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  console.log('[mailchimp-lists] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[mailchimp-lists] Missing authorization header');
      return jsonResponse(401, { error: 'UNAUTHORIZED', lists: [] });
    }

    const jwt = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseAdmin();

    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      console.error('[mailchimp-lists] Auth error:', userError);
      return jsonResponse(401, { error: 'INVALID_TOKEN', lists: [] });
    }

    console.log(`[mailchimp-lists] Fetching lists for user ${user.id.substring(0, 8)}...`);

    // Load user's Mailchimp connection from user_integrations
    const { data: connection, error: connError } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('platform', 'mailchimp')
      .maybeSingle();

    if (connError) {
      console.error('[mailchimp-lists] Database error', connError);
      return jsonResponse(500, { error: 'DATABASE_ERROR', lists: [] });
    }

    if (!connection || !connection.access_token) {
      console.log('[mailchimp-lists] No Mailchimp connection found for user');
      return jsonResponse(400, {
        error: 'MAILCHIMP_NOT_CONNECTED',
        message: 'Please connect your Mailchimp account first',
        lists: []
      });
    }

    const accessToken = connection.access_token;
    const dataCenter = connection.mailchimp_dc || connection.server_prefix || 'us13';

    console.log('[mailchimp-lists] Using datacenter:', dataCenter);

    const url = `https://${dataCenter}.api.mailchimp.com/3.0/lists?fields=lists.id,lists.name,lists.stats.member_count&count=100`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const text = await res.text();

    if (!res.ok) {
      console.error('[mailchimp-lists] Mailchimp API error:', {
        status: res.status,
        statusText: res.statusText,
        body: text,
      });

      return jsonResponse(502, {
        error: 'MAILCHIMP_API_ERROR',
        status: res.status,
        lists: [],
      });
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch (parseError) {
      console.error('[mailchimp-lists] Failed to parse Mailchimp response:', parseError, text);
      return jsonResponse(502, {
        error: 'MAILCHIMP_PARSE_ERROR',
        lists: [],
      });
    }

    const lists = Array.isArray(json.lists) && json.lists.length > 0
      ? json.lists.map((l: any) => ({
          id: l.id,
          name: l.name,
          member_count: l.stats?.member_count || 0,
        }))
      : [];

    console.log(`[mailchimp-lists] Successfully fetched ${lists.length} lists for user ${user.id}`);

    return jsonResponse(200, { lists });
  } catch (err: any) {
    console.error('[mailchimp-lists] Unexpected error:', err);
    return jsonResponse(500, {
      error: 'UNEXPECTED_ERROR',
      message: err?.message || 'Unknown error',
      lists: [],
    });
  }
};
