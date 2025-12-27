import { createClient } from '@supabase/supabase-js';

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

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[SERVER] Missing Supabase env vars in Netlify (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
    'Check Netlify Dashboard → Site settings → Environment variables.'
  );
}

export const supabaseServer = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
