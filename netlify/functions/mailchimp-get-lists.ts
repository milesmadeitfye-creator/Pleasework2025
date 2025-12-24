import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
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
  console.log('[mailchimp-get-lists] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[mailchimp-get-lists] Missing authorization header');
      return jsonResponse(401, { error: 'UNAUTHORIZED' });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[mailchimp-get-lists] Auth verification failed', authError);
      return jsonResponse(401, { error: 'INVALID_TOKEN' });
    }

    console.log('[mailchimp-get-lists] User verified', {
      userId: user.id.substring(0, 8) + '...',
    });

    // Load user's Mailchimp connection
    const { data: connection, error: connError } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('platform', 'mailchimp')
      .maybeSingle();

    if (connError) {
      console.error('[mailchimp-get-lists] Database error', connError);
      return jsonResponse(500, { error: 'DATABASE_ERROR' });
    }

    if (!connection || !connection.access_token) {
      console.log('[mailchimp-get-lists] No Mailchimp connection found');
      return jsonResponse(400, {
        success: false,
        error: 'MAILCHIMP_NOT_CONNECTED',
        message: 'Please connect your Mailchimp account first',
      });
    }

    const accessToken = connection.access_token;
    const dataCenter = connection.mailchimp_dc || connection.server_prefix || 'us13';

    console.log('[mailchimp-get-lists] Fetching lists from Mailchimp', {
      dataCenter,
    });

    // Fetch all lists from Mailchimp
    const listsUrl = `https://${dataCenter}.api.mailchimp.com/3.0/lists?count=1000`;
    const listsRes = await fetch(listsUrl, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const listsText = await listsRes.text();

    if (!listsRes.ok) {
      console.error('[mailchimp-get-lists] Mailchimp API error', {
        status: listsRes.status,
        error: listsText,
      });
      return jsonResponse(500, {
        success: false,
        error: 'MAILCHIMP_API_ERROR',
        message: 'Failed to fetch lists from Mailchimp',
      });
    }

    let listsData: any;
    try {
      listsData = listsText ? JSON.parse(listsText) : {};
    } catch (parseErr) {
      console.error('[mailchimp-get-lists] Failed to parse Mailchimp response', {
        error: parseErr,
        text: listsText.substring(0, 200),
      });
      return jsonResponse(502, {
        success: false,
        error: 'MAILCHIMP_PARSE_ERROR',
        message: 'Mailchimp returned non-JSON response',
      });
    }

    const lists = listsData.lists || [];

    console.log('[mailchimp-get-lists] Fetched lists', {
      count: lists.length,
    });

    // Simplify list data for frontend
    const simplifiedLists = lists.map((list: any) => ({
      id: list.id,
      name: list.name,
      stats: {
        member_count: list.stats?.member_count || 0,
        unsubscribe_count: list.stats?.unsubscribe_count || 0,
        cleaned_count: list.stats?.cleaned_count || 0,
        open_rate: list.stats?.open_rate || 0,
        click_rate: list.stats?.click_rate || 0,
      },
      date_created: list.date_created,
    }));

    return jsonResponse(200, {
      success: true,
      lists: simplifiedLists,
      count: simplifiedLists.length,
    });
  } catch (err: any) {
    console.error('[mailchimp-get-lists] Unexpected error', err);
    return jsonResponse(500, {
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    });
  }
};

export default handler;
