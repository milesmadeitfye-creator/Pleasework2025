import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, hasSupabaseEnv } from './supabaseEnv';

/**
 * BROWSER ONLY Supabase Client
 *
 * CRITICAL: May be null if env not configured.
 * ALWAYS check before use: if (!supabase) return fallback;
 */

if (typeof window === 'undefined') {
  console.warn(
    '[Supabase Client] Imported in server context. ' +
    'Use src/lib/supabase.server.ts for server-side code.'
  );
}

// Create client only if configured
export const supabase: SupabaseClient | null = hasSupabaseEnv
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// Export config status
export const isSupabaseConfigured = hasSupabaseEnv;

/**
 * Safe getter - returns null if not configured
 */
export function getSupabaseClient(): SupabaseClient | null {
  return supabase;
}

/**
 * Get base URL (may be empty string)
 */
export function getSupabaseUrl(): string {
  return SUPABASE_URL;
}

/**
 * Require Supabase - use only in components that MUST have DB
 * Logs error instead of throwing to prevent crashes
 */
export function requireSupabaseClient(): SupabaseClient | null {
  if (!supabase) {
    console.error(
      '[Supabase Client] Not configured. Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Features requiring database will be disabled.'
    );
    return null;
  }
  return supabase;
}
