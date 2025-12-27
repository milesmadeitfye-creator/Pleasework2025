import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * SERVER ONLY Supabase client.
 *
 * Used by Netlify Functions and shared server-side code (like AI context)
 * that gets bundled by Netlify's esbuild.
 *
 * Uses process.env (NOT import.meta.env).
 *
 * IMPORTANT: Import this via RELATIVE PATHS, never via @ alias.
 * Example: import { supabaseServer } from '../../lib/supabase.server';
 */

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// Log configuration status (lengths only, not values)
const hasUrl = !!supabaseUrl;
const hasKey = !!supabaseAnonKey;
console.log('[Supabase Server] Configured:', hasUrl && hasKey, '| URL:', hasUrl ? `${supabaseUrl?.length} chars` : 'missing', '| Key:', hasKey ? `${supabaseAnonKey?.length} chars` : 'missing');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[SERVER] Missing Supabase env vars in Netlify (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
    'Check Netlify Dashboard → Site settings → Environment variables. ' +
    'Supabase features will be disabled.'
  );
}

// Create client even if vars missing (will fail gracefully at usage time)
export const supabaseServer: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// Export config status for conditional feature enablement
export const isSupabaseConfigured = hasUrl && hasKey;
