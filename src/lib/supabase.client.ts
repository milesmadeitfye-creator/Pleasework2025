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
console.log('[Supabase Client] Configured:', hasUrl && hasKey, '| URL:', hasUrl ? `${supabaseUrl?.length} chars` : 'missing', '| Key:', hasKey ? `${supabaseAnonKey?.length} chars` : 'missing');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[CLIENT] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY - Supabase features disabled');
}

// Create client even if vars missing (will fail gracefully at usage time)
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

// Export config status for conditional feature enablement
export const isSupabaseConfigured = hasUrl && hasKey;
