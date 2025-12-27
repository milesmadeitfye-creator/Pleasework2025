/**
 * BROWSER ONLY Supabase Client - SINGLETON
 *
 * CRITICAL PATTERN:
 * - Uses window.__ghosteSupabase to ensure only ONE GoTrueClient instance
 * - Reads ONLY from VITE_ prefixed env vars (Vite build-time injection)
 * - NEVER throws, returns null if not configured
 * - ALWAYS check before use: if (!supabase) return fallback;
 *
 * WHY SINGLETON:
 * Multiple Supabase clients cause "GoTrueClient already registered" warnings
 * and auth state conflicts.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Read from VITE_ prefixed vars ONLY (browser build-time injection)
const url = import.meta.env.VITE_SUPABASE_URL || '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Global singleton cache
declare global {
  interface Window {
    __ghosteSupabase?: SupabaseClient;
  }
}

/**
 * Build Supabase client with standard config
 * THROWS if env vars missing (fail-fast in dev)
 */
function buildClient(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      '[Supabase Client] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Check Netlify env vars are set and prefixed with VITE_.'
    );
  }

  if (import.meta.env.DEV) {
    console.log(
      `[Supabase Client] Initializing singleton | ` +
      `url=${new URL(url).hostname} | ` +
      `anonKeyLen=${anonKey.length}ch`
    );
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'ghoste.auth',
    },
  });
}

/**
 * SINGLETON Supabase client
 * - Cached in window.__ghosteSupabase
 * - Created once per page load
 * - Null if env not configured
 */
export const supabase: SupabaseClient | null =
  typeof window !== 'undefined'
    ? (window.__ghosteSupabase ?? (window.__ghosteSupabase = buildClient()))
    : (() => {
        console.warn(
          '[Supabase Client] Imported in server context. ' +
          'Use src/lib/supabase.server.ts instead.'
        );
        return null;
      })();

/**
 * Check if Supabase is configured
 */
export const isSupabaseConfigured = Boolean(supabase);

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
  return url;
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
