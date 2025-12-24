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
  console.log('[mailchimp-sync-tags] Request received');

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
      console.error('[mailchimp-sync-tags] Missing authorization header');
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
      console.error('[mailchimp-sync-tags] Auth verification failed', authError);
      return jsonResponse(401, { error: 'INVALID_TOKEN' });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { list_id } = body;

    if (!list_id) {
      return jsonResponse(400, {
        success: false,
        error: 'MISSING_LIST_ID',
        message: 'list_id is required',
      });
    }

    console.log('[mailchimp-sync-tags] User verified', {
      userId: user.id.substring(0, 8) + '...',
      listId: list_id,
    });

    // Load user's Mailchimp connection
    const { data: connections, error: connError } = await supabase
      .from('mailchimp_connections')
      .select('*')
      .eq('user_id', user.id)
      .limit(1);

    if (connError) {
      console.error('[mailchimp-sync-tags] Database error', connError);
      return jsonResponse(500, { error: 'DATABASE_ERROR' });
    }

    if (!connections || connections.length === 0 || !connections[0].access_token) {
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

    // Fetch segments/tags from Mailchimp
    // Tags in Mailchimp v3 API are under segments with type "static"
    const segmentsUrl = `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${list_id}/segments?count=1000&type=static`;

    console.log('[mailchimp-sync-tags] Fetching segments from Mailchimp', {
      url: segmentsUrl,
    });

    const segmentsRes = await fetch(segmentsUrl, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!segmentsRes.ok) {
      const errorText = await segmentsRes.text();
      console.error('[mailchimp-sync-tags] Mailchimp API error', {
        status: segmentsRes.status,
        error: errorText,
      });
      return jsonResponse(500, {
        success: false,
        error: 'MAILCHIMP_API_ERROR',
        message: 'Failed to fetch tags from Mailchimp',
      });
    }

    const segmentsData: any = await segmentsRes.json();
    const segments = segmentsData.segments || [];

    console.log('[mailchimp-sync-tags] Fetched segments', {
      count: segments.length,
    });

    // Extract tag names (segments of type "static" are tags)
    const tagNames = segments
      .filter((seg: any) => seg.type === 'static')
      .map((seg: any) => seg.name);

    if (tagNames.length === 0) {
      return jsonResponse(200, {
        success: true,
        tags: [],
        message: 'No tags found in this list',
      });
    }

    // Upsert tags into mailchimp_tags table
    const tagsToUpsert = tagNames.map((name: string) => ({
      user_id: user.id,
      list_id,
      name,
    }));

    const { error: upsertError } = await supabase
      .from('mailchimp_tags')
      .upsert(tagsToUpsert, {
        onConflict: 'user_id,list_id,name',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error('[mailchimp-sync-tags] Failed to upsert tags', upsertError);
      return jsonResponse(500, {
        success: false,
        error: 'DATABASE_UPSERT_ERROR',
        message: 'Failed to save tags to database',
      });
    }

    console.log('[mailchimp-sync-tags] Tags synced successfully', {
      count: tagsToUpsert.length,
    });

    return jsonResponse(200, {
      success: true,
      tags: tagsToUpsert,
      count: tagsToUpsert.length,
    });
  } catch (err: any) {
    console.error('[mailchimp-sync-tags] Unexpected error', err);
    return jsonResponse(500, {
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    });
  }
};

export default handler;
