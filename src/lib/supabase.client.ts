import { createClient } from '@supabase/supabase-js';

/**
 * BROWSER ONLY - This file uses import.meta.env
 * If you see this error in a Netlify Function, use supabase.server.ts instead
 */
if (typeof window === 'undefined') {
  throw new Error(
    '[CLIENT] supabase.client.ts imported in server context. ' +
    'Use src/lib/supabase.server.ts (for shared code) or ' +
    'netlify/functions/_lib/supabase.server.ts (for functions) instead.'
  );
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('[CLIENT] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
