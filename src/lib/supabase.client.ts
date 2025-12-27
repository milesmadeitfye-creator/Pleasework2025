import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Log configuration status (lengths only, not values)
const hasUrl = !!supabaseUrl;
const hasKey = !!supabaseAnonKey;
console.log(
  '[Supabase Client] clientConfigured=', hasUrl && hasKey,
  '| urlLen=', supabaseUrl?.length ?? 0,
  '| anonLen=', supabaseAnonKey?.length ?? 0
);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase Client] CRITICAL: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Supabase features will NOT work. Check .env file or build environment variables.'
  );
}

// Export config status for conditional feature enablement
export const isSupabaseConfigured = hasUrl && hasKey;

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

// Export client (will be null if not configured)
export const supabase: SupabaseClient = supabaseInstance as SupabaseClient;

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
  return supabaseUrl || null;
}
