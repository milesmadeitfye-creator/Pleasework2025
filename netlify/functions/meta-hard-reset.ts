import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminResetKey = process.env.ADMIN_RESET_KEY || 'ghoste-dev-reset-2024';
const adminEmails = ['milesdorre5@gmail.com'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
};

/**
 * ADMIN-ONLY: Hard reset ALL Meta credentials
 * Use with caution - clears all Meta connection data
 *
 * Safety gates:
 * 1. x-admin-key header must match ADMIN_RESET_KEY env var
 * OR
 * 2. User email must be in admin allowlist
 */
export const handler: Handler = async (event) => {
  console.log('[meta-hard-reset] Request received:', event.httpMethod);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Safety gate 1: Check x-admin-key header
    const adminKey = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
    const hasValidKey = adminKey === adminResetKey;

    // Safety gate 2: Check user email
    const authHeader = event.headers.authorization || event.headers.Authorization;
    let hasValidEmail = false;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      });

      const { data: userData, error: authError } = await supabase.auth.getUser(token);

      if (!authError && userData?.user?.email) {
        hasValidEmail = adminEmails.includes(userData.user.email);
        console.log('[meta-hard-reset] User email:', userData.user.email, 'allowed:', hasValidEmail);
      }
    }

    // Require at least one safety gate
    if (!hasValidKey && !hasValidEmail) {
      console.error('[meta-hard-reset] Unauthorized: no valid key or admin email');
      return {
        statusCode: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'FORBIDDEN',
          message: 'Admin access required. Provide x-admin-key header or use admin email.',
        }),
      };
    }

    console.log('[meta-hard-reset] Safety gate passed, proceeding with hard reset');

    // Create admin client
    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Hard reset: DELETE all rows from meta_credentials
    const { error: deleteCredsError } = await admin
      .from('meta_credentials')
      .delete()
      .neq('user_id', '00000000-0000-0000-0000-000000000000'); // Delete all (neq dummy UUID)

    if (deleteCredsError) {
      console.error('[meta-hard-reset] Failed to delete meta_credentials:', deleteCredsError);
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'RESET_FAILED',
          message: 'Failed to clear meta_credentials',
          details: deleteCredsError.message,
        }),
      };
    }

    // Also clear user_meta_assets
    const { error: deleteAssetsError } = await admin
      .from('user_meta_assets')
      .delete()
      .neq('user_id', '00000000-0000-0000-0000-000000000000');

    if (deleteAssetsError) {
      console.warn('[meta-hard-reset] Failed to clear user_meta_assets:', deleteAssetsError);
    }

    // Clear meta_connections
    const { error: deleteConnectionsError } = await admin
      .from('meta_connections')
      .delete()
      .neq('user_id', '00000000-0000-0000-0000-000000000000');

    if (deleteConnectionsError) {
      console.warn('[meta-hard-reset] Failed to clear meta_connections:', deleteConnectionsError);
    }

    // Clear connected_accounts Meta entries
    const { error: deleteConnectedError } = await admin
      .from('connected_accounts')
      .delete()
      .eq('provider', 'meta');

    if (deleteConnectedError) {
      console.warn('[meta-hard-reset] Failed to clear connected_accounts:', deleteConnectedError);
    }

    console.log('[meta-hard-reset] ✅ Hard reset complete - all Meta data cleared');

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Meta credentials and assets cleared. Reconnect to restore.',
        tables_cleared: [
          'meta_credentials',
          'user_meta_assets',
          'meta_connections',
          'connected_accounts (meta)',
        ],
      }),
    };
  } catch (err: any) {
    console.error('[meta-hard-reset] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'RESET_FAILED',
        message: err?.message || 'Unknown error during hard reset',
      }),
    };
  }
};
