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

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_PROJECT_URL;

const supabaseAnonKey =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

// Log configuration status (lengths only, not values)
const hasUrl = !!supabaseUrl;
const hasKey = !!supabaseAnonKey;
console.log(
  '[Supabase Server] configured=', hasUrl && hasKey,
  '| urlLen=', supabaseUrl?.length ?? 0,
  '| anonLen=', supabaseAnonKey?.length ?? 0
);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase Server] CRITICAL: Missing Supabase env vars in Netlify. ' +
    'Checked: VITE_SUPABASE_URL, SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_ANON_KEY. ' +
    'Go to: Netlify Dashboard → Site Settings → Environment Variables. ' +
    'Functions requiring Supabase will return 500 errors.'
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
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

// Export client (will be null if not configured)
export const supabaseServer: SupabaseClient = supabaseInstance as SupabaseClient;

// Safe getter that returns null if not configured
export function getSupabaseServerClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    console.error('[Supabase Server] Cannot get client - not configured');
    return null;
  }
  return supabaseInstance;
}

// Get base URL for manual REST calls (never returns placeholder)
export function getSupabaseServerUrl(): string | null {
  return supabaseUrl || null;
}

// Helper to create 500 response when Supabase not configured
export function createSupabaseNotConfiguredResponse() {
  return new Response(
    JSON.stringify({
      error: 'Supabase not configured',
      message: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment variables',
      hint: 'Check Netlify Dashboard → Site Settings → Environment Variables'
    }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
