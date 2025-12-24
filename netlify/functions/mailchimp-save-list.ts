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
  console.log('[mailchimp-save-list] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[mailchimp-save-list] Missing authorization header');
      return jsonResponse(401, { success: false, error: 'UNAUTHORIZED' });
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
      console.error('[mailchimp-save-list] Auth verification failed', authError);
      return jsonResponse(401, { success: false, error: 'INVALID_TOKEN' });
    }

    console.log('[mailchimp-save-list] User verified', {
      userId: user.id.substring(0, 8) + '...',
    });

    const body = event.body ? JSON.parse(event.body) : {};
    const { listId, listName } = body;

    if (!listId || !listName) {
      return jsonResponse(400, {
        success: false,
        error: 'Missing listId or listName',
      });
    }

    console.log('[mailchimp-save-list] Updating user_integrations', {
      userId: user.id.substring(0, 8) + '...',
      listId: listId.substring(0, 8) + '...',
      listName,
    });

    const { data, error } = await supabase
      .from('user_integrations')
      .update({
        mailchimp_list_id: listId,
        mailchimp_list_name: listName,
        mailchimp_status: 'active',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('provider', 'mailchimp')
      .select()
      .maybeSingle();

    if (error) {
      console.error('[mailchimp-save-list] Failed to save audience', error);
      return jsonResponse(500, {
        success: false,
        error: 'Failed to save audience',
        details: error.message,
      });
    }

    if (!data) {
      console.error('[mailchimp-save-list] No integration found for user');
      return jsonResponse(404, {
        success: false,
        error: 'Mailchimp integration not found. Please connect Mailchimp first.',
      });
    }

    console.log('[mailchimp-save-list] Audience saved successfully', {
      integrationId: data.id,
      listId,
    });

    return jsonResponse(200, {
      success: true,
      integration: {
        mailchimp_list_id: data.mailchimp_list_id,
        mailchimp_list_name: data.mailchimp_list_name,
        mailchimp_status: data.mailchimp_status,
      },
    });
  } catch (err: any) {
    console.error('[mailchimp-save-list] Unexpected error', err);
    return jsonResponse(500, {
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    });
  }
};

export default handler;
