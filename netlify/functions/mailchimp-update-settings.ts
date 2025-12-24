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
  console.log('[mailchimp-update-settings] Request received');

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
      console.error('[mailchimp-update-settings] Missing authorization header');
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
      console.error('[mailchimp-update-settings] Auth verification failed', authError);
      return jsonResponse(401, { error: 'INVALID_TOKEN' });
    }

    console.log('[mailchimp-update-settings] User verified', {
      userId: user.id.substring(0, 8) + '...',
    });

    const body = event.body ? JSON.parse(event.body) : {};
    const { default_list_id, double_opt_in } = body;

    if (!default_list_id) {
      return jsonResponse(400, {
        success: false,
        error: 'MISSING_LIST_ID',
        message: 'default_list_id is required',
      });
    }

    // Verify the list belongs to this user
    const { data: list } = await supabase
      .from('mailchimp_lists')
      .select('list_id')
      .eq('user_id', user.id)
      .eq('list_id', default_list_id)
      .maybeSingle();

    if (!list) {
      return jsonResponse(400, {
        success: false,
        error: 'INVALID_LIST_ID',
        message: 'List not found or does not belong to user',
      });
    }

    // Upsert settings
    const { error: upsertError } = await supabase
      .from('user_mailchimp_settings')
      .upsert(
        {
          user_id: user.id,
          default_list_id,
          double_opt_in: double_opt_in !== undefined ? double_opt_in : false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      console.error('[mailchimp-update-settings] Failed to update settings', upsertError);
      return jsonResponse(500, {
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to update settings',
      });
    }

    console.log('[mailchimp-update-settings] Settings updated successfully', {
      default_list_id,
    });

    return jsonResponse(200, {
      success: true,
      settings: {
        user_id: user.id,
        default_list_id,
        double_opt_in: double_opt_in !== undefined ? double_opt_in : false,
      },
    });
  } catch (err: any) {
    console.error('[mailchimp-update-settings] Unexpected error', err);
    return jsonResponse(500, {
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    });
  }
};

export default handler;
