/**
 * AI Setup Status Debug Endpoint
 *
 * Protected endpoint that returns canonical setup status for the authenticated user
 * Used for debugging AI context issues
 *
 * PROTECTED: Requires authentication
 * SECURITY: Only returns data for the authenticated user
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { getAISetupStatus, formatSetupStatusForAI } from './_aiSetupStatus';

function getCorsHeaders(): Record<string, string> {
  const allowedOrigin = process.env.GHOSTE_ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const handler: Handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: '',
    };
  }

  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: getCorsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: getCorsHeaders(),
        body: JSON.stringify({ error: 'Unauthorized - missing or invalid Authorization header' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[ai-setup-status] Auth error:', authError);
      return {
        statusCode: 401,
        headers: getCorsHeaders(),
        body: JSON.stringify({ error: 'Unauthorized - invalid token' }),
      };
    }

    console.log('[ai-setup-status] Fetching setup status for user:', user.id);

    // Get setup status
    const setupStatus = await getAISetupStatus(user.id);

    // Format for AI
    const aiPrompt = formatSetupStatusForAI(setupStatus);

    return {
      statusCode: 200,
      headers: {
        ...getCorsHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: user.id,
        setupStatus,
        aiPrompt,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error: any) {
    console.error('[ai-setup-status] Error:', error);
    return {
      statusCode: 500,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        error: 'Failed to fetch setup status',
        message: error.message,
      }),
    };
  }
};
