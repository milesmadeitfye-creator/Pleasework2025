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
  console.log('[mailchimp-sync-lists] Request received');

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
      console.error('[mailchimp-sync-lists] Missing authorization header');
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
      console.error('[mailchimp-sync-lists] Auth verification failed', authError);
      return jsonResponse(401, { error: 'INVALID_TOKEN' });
    }

    console.log('[mailchimp-sync-lists] User verified', {
      userId: user.id.substring(0, 8) + '...',
    });

    // Load user's Mailchimp connection
    const { data: connections, error: connError } = await supabase
      .from('mailchimp_connections')
      .select('*')
      .eq('user_id', user.id)
      .limit(1);

    if (connError) {
      console.error('[mailchimp-sync-lists] Database error', connError);
      return jsonResponse(500, { error: 'DATABASE_ERROR' });
    }

    if (!connections || connections.length === 0 || !connections[0].access_token) {
      console.log('[mailchimp-sync-lists] No Mailchimp connection found');
      return jsonResponse(400, {
        success: false,
        error: 'MAILCHIMP_NOT_CONNECTED',
        message: 'Please connect your Mailchimp account first',
      });
    }

    const connection = connections[0];
    const accessToken = connection.access_token;
    const serverPrefix =
      connection.server_prefix ||
      connection.data_center ||
      connection.dc ||
      'us13';

    console.log('[mailchimp-sync-lists] Fetching lists from Mailchimp', {
      serverPrefix,
    });

    // Fetch all lists from Mailchimp
    const listsUrl = `https://${serverPrefix}.api.mailchimp.com/3.0/lists?count=1000`;
    const listsRes = await fetch(listsUrl, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!listsRes.ok) {
      const errorText = await listsRes.text();
      console.error('[mailchimp-sync-lists] Mailchimp API error', {
        status: listsRes.status,
        error: errorText,
      });
      return jsonResponse(500, {
        success: false,
        error: 'MAILCHIMP_API_ERROR',
        message: 'Failed to fetch lists from Mailchimp',
      });
    }

    const listsData: any = await listsRes.json();
    const lists = listsData.lists || [];

    console.log('[mailchimp-sync-lists] Fetched lists', {
      count: lists.length,
    });

    if (lists.length === 0) {
      console.log('[mailchimp-sync-lists] No lists found');
      return jsonResponse(200, {
        success: true,
        lists: [],
        message: 'No lists found in your Mailchimp account',
      });
    }

    // Upsert lists into mailchimp_lists table
    const listsToUpsert = lists.map((list: any) => ({
      user_id: user.id,
      list_id: list.id,
      name: list.name,
      from_name: list.campaign_defaults?.from_name || null,
      from_email: list.campaign_defaults?.from_email || null,
      stats: {
        member_count: list.stats?.member_count || 0,
        unsubscribe_count: list.stats?.unsubscribe_count || 0,
        cleaned_count: list.stats?.cleaned_count || 0,
        member_count_since_send: list.stats?.member_count_since_send || 0,
        unsubscribe_count_since_send: list.stats?.unsubscribe_count_since_send || 0,
        cleaned_count_since_send: list.stats?.cleaned_count_since_send || 0,
        campaign_count: list.stats?.campaign_count || 0,
        campaign_last_sent: list.stats?.campaign_last_sent || null,
        merge_field_count: list.stats?.merge_field_count || 0,
        avg_sub_rate: list.stats?.avg_sub_rate || 0,
        avg_unsub_rate: list.stats?.avg_unsub_rate || 0,
        target_sub_rate: list.stats?.target_sub_rate || 0,
        open_rate: list.stats?.open_rate || 0,
        click_rate: list.stats?.click_rate || 0,
      },
    }));

    const { error: upsertError } = await supabase
      .from('mailchimp_lists')
      .upsert(listsToUpsert, {
        onConflict: 'user_id,list_id',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error('[mailchimp-sync-lists] Failed to upsert lists', upsertError);
      return jsonResponse(500, {
        success: false,
        error: 'DATABASE_UPSERT_ERROR',
        message: 'Failed to save lists to database',
      });
    }

    console.log('[mailchimp-sync-lists] Lists synced successfully', {
      count: listsToUpsert.length,
    });

    // Check/set default list in user_mailchimp_settings
    const { data: settings } = await supabase
      .from('user_mailchimp_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!settings || !settings.default_list_id) {
      // Set first list as default
      const defaultListId = lists[0].id;
      await supabase.from('user_mailchimp_settings').upsert(
        {
          user_id: user.id,
          default_list_id: defaultListId,
          double_opt_in: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      console.log('[mailchimp-sync-lists] Set default list', {
        defaultListId,
      });
    }

    return jsonResponse(200, {
      success: true,
      lists: listsToUpsert,
      count: listsToUpsert.length,
    });
  } catch (err: any) {
    console.error('[mailchimp-sync-lists] Unexpected error', err);
    return jsonResponse(500, {
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    });
  }
};

export default handler;
