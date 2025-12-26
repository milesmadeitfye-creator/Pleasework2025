/**
 * AI Debug Setup Endpoint
 *
 * Debug endpoint that returns setup status via the RPC function
 * Used for diagnosing AI context and configuration issues
 *
 * PROTECTED: Requires authentication
 * SECURITY: Only returns data for the authenticated user, no secrets exposed
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: getCorsHeaders(),
      body: JSON.stringify({ ok: false, error: 'method_not_allowed' }),
    };
  }

  try {
    console.log('[ai-debug-setup] Request received');
    console.log('[ai-debug-setup] Headers:', JSON.stringify(event.headers));

    const supabase = getSupabaseAdmin();

    if (!supabase) {
      console.error('[ai-debug-setup] Failed to create Supabase admin client');
      return {
        statusCode: 500,
        headers: getCorsHeaders(),
        body: JSON.stringify({
          ok: false,
          error: 'server_config_error',
          supabaseUrlUsed: process.env.SUPABASE_URL ? '[SET]' : null,
          hasServiceRoleKey: false,
        }),
      };
    }

    console.log('[ai-debug-setup] Supabase admin client created successfully');
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      console.error('[ai-debug-setup] No Authorization header provided');
      return {
        statusCode: 401,
        headers: getCorsHeaders(),
        body: JSON.stringify({ ok: false, error: 'missing_auth' }),
      };
    }

    if (!authHeader.startsWith('Bearer ')) {
      console.error('[ai-debug-setup] Authorization header does not start with Bearer');
      return {
        statusCode: 401,
        headers: getCorsHeaders(),
        body: JSON.stringify({ ok: false, error: 'invalid_auth_format' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('[ai-debug-setup] Extracted token, verifying with Supabase...');

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[ai-debug-setup] Auth verification failed:', {
        hasError: !!authError,
        errorMessage: authError?.message,
        errorStatus: authError?.status,
        hasUser: !!user,
      });
      return {
        statusCode: 401,
        headers: getCorsHeaders(),
        body: JSON.stringify({
          ok: false,
          error: 'invalid_token',
          details: authError?.message || 'No user found',
        }),
      };
    }

    const userId = user.id;
    console.log('[ai-debug-setup] User authenticated successfully:', userId);
    console.log('[ai-debug-setup] Fetching setup status for user:', userId);

    const { data: setupStatus, error: rpcError } = await supabase.rpc('ai_get_setup_status', {
      p_user_id: userId,
    });

    if (rpcError) {
      console.error('[ai-debug-setup] RPC error:', rpcError);
      return {
        statusCode: 500,
        headers: getCorsHeaders(),
        body: JSON.stringify({
          ok: false,
          error: 'rpc_error',
          rpcErrorMessage: rpcError.message,
          rpcErrorCode: rpcError.code,
          userId,
          supabaseUrlUsed: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.replace(/https?:\/\//, '').split('.')[0] + '...' : null,
          hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        ...getCorsHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ok: true,
        userId,
        supabaseUrlUsed: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.replace(/https?:\/\//, '').split('.')[0] + '...' : null,
        hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        setupStatus,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error: any) {
    console.error('[ai-debug-setup] Error:', error);
    return {
      statusCode: 500,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        ok: false,
        error: 'internal_error',
        message: error.message,
      }),
    };
  }
};
