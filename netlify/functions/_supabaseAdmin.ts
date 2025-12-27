// netlify/functions/_supabaseAdmin.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, hasSupabaseEnv, hasServiceRoleKey } from "../../src/lib/supabaseEnv";

// Use service role if available, otherwise anon (for functions without admin privileges)
const keyToUse = hasServiceRoleKey ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
const isConfigured = hasSupabaseEnv && !!keyToUse;

console.log(
  '[Supabase Admin] configured=', isConfigured,
  '| urlLen=', SUPABASE_URL.length,
  '| serviceKeyLen=', SUPABASE_SERVICE_ROLE_KEY.length,
  '| anonKeyLen=', SUPABASE_ANON_KEY.length,
  '| usingServiceRole=', hasServiceRoleKey
);

if (!isConfigured) {
  console.warn(
    "[Supabase Admin] Missing Supabase configuration. " +
    "Admin functions will be disabled. " +
    "Check Netlify Dashboard → Site Settings → Environment Variables"
  );
}

// Create admin client only if configured
let adminInstance: SupabaseClient | null = null;

if (isConfigured) {
  adminInstance = createClient(
    SUPABASE_URL,
    keyToUse,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// Export config status
export const isSupabaseAdminConfigured = isConfigured;

// Safe getter functions - ALWAYS use these, never raw exports
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isConfigured) {
    console.error('[Supabase Admin] Cannot get admin client - not configured');
    return null;
  }
  return adminInstance;
}

// Alias for consistency with function naming
export function getSupabaseAdminClient(): SupabaseClient | null {
  return getSupabaseAdmin();
}

// Legacy raw exports (DEPRECATED - use getSupabaseAdmin() instead)
// These may be null - callers MUST check before using
export const supabaseAdmin: SupabaseClient | null = adminInstance;
export const supabase: SupabaseClient | null = adminInstance;

/**
 * Get Meta access token for a user from user_meta_connections table.
 * Falls back to system token if user token not found.
 *
 * This ensures API calls are attributed to real users for Meta App Review.
 */
export async function getMetaAccessTokenForUser(
  userId: string
): Promise<{ token: string; source: 'user' | 'system' }> {
  const admin = getSupabaseAdmin();

  if (!admin) {
    console.warn('[getMetaAccessTokenForUser] Supabase not configured, using system token');

    const systemToken = process.env.META_ACCESS_TOKEN || process.env.META_SYSTEM_USER_TOKEN;
    if (!systemToken) {
      throw new Error('No Meta user token and no system token configured');
    }

    return { token: systemToken, source: 'system' };
  }

  const { data, error } = await admin
    .from('user_meta_connections')
    .select('access_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    console.warn(
      `[getMetaAccessTokenForUser] No user Meta token found for ${userId}, falling back to system token`,
      error
    );

    // Fallback to system token
    const systemToken = process.env.META_ACCESS_TOKEN || process.env.META_SYSTEM_USER_TOKEN;
    if (!systemToken) {
      throw new Error('No Meta user token and no system token configured');
    }

    return { token: systemToken, source: 'system' };
  }

  // TODO: Check if token is expired and refresh if needed
  // For now, just log if it's expiring soon
  if (data.expires_at) {
    const expiresAt = new Date(data.expires_at);
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (expiresAt < sevenDaysFromNow) {
      console.warn(
        `[getMetaAccessTokenForUser] Token for ${userId} expires soon (${expiresAt}), should prompt reconnect`
      );
    }
  }

  return { token: data.access_token as string, source: 'user' };
}

/**
 * Helper to create a standard "Supabase disabled" response
 * Use this in functions when Supabase is not configured
 */
export function createSupabaseDisabledResponse() {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      ok: false,
      disabled: true,
      reason: 'Supabase server not configured',
      message: 'Database connection not available. Check environment variables.',
    }),
  };
}
