import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, hasSupabaseEnv, hasServiceRoleKey } from './supabaseEnv';

/**
 * SERVER ONLY Supabase client
 *
 * CRITICAL: May be null if env not configured.
 * ALWAYS check before use: if (!supabaseServer) return fallback;
 *
 * Uses process.env via supabaseEnv.ts
 * Import via RELATIVE paths (never @ alias)
 */

// Use service role key if available, otherwise anon key
const keyToUse = hasServiceRoleKey ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;

// Create client only if configured
export const supabaseServer: SupabaseClient | null = hasSupabaseEnv
  ? createClient(SUPABASE_URL, keyToUse, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

// Export config status
export const isSupabaseConfigured = hasSupabaseEnv;

/**
 * Safe getter - returns null if not configured
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  return supabaseServer;
}

/**
 * Get base URL (may be empty string)
 */
export function getSupabaseServerUrl(): string {
  return SUPABASE_URL;
}

/**
 * Helper to create safe response when Supabase not configured
 * Returns 200 with disabled flag (not 500) to prevent error loops
 */
export function createSupabaseNotConfiguredResponse() {
  return new Response(
    JSON.stringify({
      ok: false,
      disabled: true,
      reason: 'supabase_not_configured',
      message: 'Database warming up or not configured',
      hint: 'Retry in a moment. If persists, check environment variables.'
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
}
