import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getPublicSupabaseUrl, getPublicSupabaseAnonKey, isPublicSupabaseConfigured, logEnvConfig } from './env';

/**
 * BROWSER ONLY - This file uses import.meta.env
 * If you see this error in a Netlify Function, use supabase.server.ts instead
 */
if (typeof window === 'undefined') {
  console.error(
    '[CLIENT] supabase.client.ts imported in server context. ' +
    'Use src/lib/supabase.server.ts (for shared code) or ' +
    'netlify/functions/_lib/supabase.server.ts (for functions) instead.'
  );
}

// Get env vars using central resolver
const supabaseUrl = getPublicSupabaseUrl();
const supabaseAnonKey = getPublicSupabaseAnonKey();

// Log configuration status (lengths only, not values)
logEnvConfig('[Supabase Client]');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase Client] CRITICAL: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Supabase features will NOT work. Check .env file or build environment variables.'
  );
}

// Export config status for conditional feature enablement
export const isSupabaseConfigured = isPublicSupabaseConfigured();

// Create client only if vars exist - NEVER use placeholder URLs
let supabaseInstance: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey) {
  supabaseInstance = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
}

// Export client (may be null if not configured)
export const supabase: SupabaseClient | null = supabaseInstance;

// Safe getter that returns null if not configured
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    console.error('[Supabase Client] Cannot get client - not configured');
    return null;
  }
  return supabaseInstance;
}

// Get base URL for manual REST calls (never returns placeholder)
export function getSupabaseUrl(): string | null {
  return supabaseUrl;
}

/**
 * Require Supabase client - throws friendly error if not configured
 * Use this in components that MUST have Supabase to function
 */
export function requireSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    throw new Error(
      'Supabase is not configured. Please check your environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).'
    );
  }
  return supabaseInstance;
}
