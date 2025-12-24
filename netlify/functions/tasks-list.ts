import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_supabaseAdmin';

const supabase = supabaseAdmin;

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

export const handler: Handler = async (event) => {
  console.log('[tasks-list] Request received:', event.httpMethod);

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
      console.error('[tasks-list] Missing auth header');
      return jsonResponse(401, { error: 'MISSING_AUTH' });
    }

    const jwt = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      console.error('[tasks-list] Auth error:', userError);
      return jsonResponse(401, { error: 'INVALID_USER' });
    }

    console.log('[tasks-list] User verified:', user.id.substring(0, 8) + '...');

    // 2. Fetch tasks for user
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('due_at', { ascending: true });

    if (error) {
      console.error('[tasks-list] Query error:', error);
      return jsonResponse(500, {
        error: 'TASKS_FETCH_FAILED',
        details: error.message,
      });
    }

    console.log('[tasks-list] Found', data?.length || 0, 'tasks');

    return jsonResponse(200, {
      success: true,
      tasks: data || [],
    });
  } catch (err: any) {
    console.error('[tasks-list] Unexpected error:', err);
    return jsonResponse(500, {
      error: 'SERVER_ERROR',
      details: err?.message || String(err),
    });
  }
};
