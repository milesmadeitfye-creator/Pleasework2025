import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
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
  console.log('[mailchimp-get-settings] Request received');

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
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[mailchimp-get-settings] Missing authorization header');
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
      console.error('[mailchimp-get-settings] Auth verification failed', authError);
      return jsonResponse(401, { error: 'INVALID_TOKEN' });
    }

    console.log('[mailchimp-get-settings] User verified', {
      userId: user.id.substring(0, 8) + '...',
    });

    // Fetch user's Mailchimp lists
    const { data: lists, error: listsError } = await supabase
      .from('mailchimp_lists')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (listsError) {
      console.error('[mailchimp-get-settings] Failed to fetch lists', listsError);
      return jsonResponse(500, { error: 'DATABASE_ERROR' });
    }

    // Fetch user's Mailchimp settings
    const { data: settings } = await supabase
      .from('user_mailchimp_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    return jsonResponse(200, {
      success: true,
      lists: lists || [],
      settings: settings || {
        user_id: user.id,
        default_list_id: null,
        double_opt_in: false,
      },
    });
  } catch (err: any) {
    console.error('[mailchimp-get-settings] Unexpected error', err);
    return jsonResponse(500, {
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    });
  }
};

export default handler;
