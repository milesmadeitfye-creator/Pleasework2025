import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

declare global {
  interface Window {
    __ghosteInternalSupabase?: SupabaseClient;
  }
}

function build(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error('[internal] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'ghoste.internal.auth',
      flowType: 'pkce',
    },
  });
}

export const supabase: SupabaseClient =
  typeof window !== 'undefined'
    ? (window.__ghosteInternalSupabase ??= build())
    : build();
