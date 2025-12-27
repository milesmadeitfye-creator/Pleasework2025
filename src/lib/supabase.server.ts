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

// Support multiple env var names for flexibility
const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_PROJECT_URL;

const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

// Reject placeholder URLs
const hasValidUrl = supabaseUrl && !supabaseUrl.includes('placeholder');
const hasValidKey = !!supabaseAnonKey;
const isConfigured = hasValidUrl && hasValidKey;

// Log configuration status (lengths only, not values)
console.log(
  '[Supabase Server] configured=', isConfigured,
  '| urlLen=', supabaseUrl?.length ?? 0,
  '| anonLen=', supabaseAnonKey?.length ?? 0
);

if (!isConfigured) {
  console.warn(
    '[Supabase Server] Missing or invalid Supabase env vars. ' +
    'Checked: SUPABASE_URL, VITE_SUPABASE_URL, SUPABASE_ANON_KEY, VITE_SUPABASE_ANON_KEY. ' +
    'Features requiring database will be disabled. ' +
    'Set env vars in: Netlify Dashboard → Site Settings → Environment Variables'
  );
}

// Export config status for conditional feature enablement
export const isSupabaseConfigured = isConfigured;

// Create client only if vars exist - NEVER use placeholder URLs
let supabaseInstance: SupabaseClient | null = null;

if (isConfigured && supabaseUrl && supabaseAnonKey) {
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

// Export client (may be null if not configured)
export const supabaseServer: SupabaseClient | null = supabaseInstance;

// Safe getter that returns null if not configured
export function getSupabaseServerClient(): SupabaseClient | null {
  if (!isConfigured) {
    console.error('[Supabase Server] Cannot get client - not configured');
    return null;
  }
  return supabaseInstance;
}

// Get base URL for manual REST calls (never returns placeholder)
export function getSupabaseServerUrl(): string | null {
  if (!isConfigured) return null;
  return supabaseUrl || null;
}

// Helper to create 500 response when Supabase not configured
export function createSupabaseNotConfiguredResponse() {
  return new Response(
    JSON.stringify({
      ok: false,
      disabled: true,
      error: 'Supabase not configured',
      message: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables',
      hint: 'Check Netlify Dashboard → Site Settings → Environment Variables'
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  );
}
