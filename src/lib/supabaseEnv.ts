/**
 * UNIFIED Supabase Environment Configuration
 *
 * Works in BOTH browser and server contexts.
 * Single source of truth for ALL Supabase env access.
 *
 * CRITICAL: This file is imported by both Vite (browser) and Netlify Functions (node).
 * Must safely handle both import.meta.env and process.env.
 */

// Safe access to import.meta.env (browser/Vite)
const getImportMetaEnv = (key: string): string | undefined => {
  try {
    return (import.meta.env as any)?.[key];
  } catch {
    return undefined;
  }
};

// Safe access to process.env (server/Node)
const getProcessEnv = (key: string): string | undefined => {
  try {
    return process.env?.[key];
  } catch {
    return undefined;
  }
};

// Universal getter - tries both contexts
const getEnv = (key: string): string => {
  return getImportMetaEnv(key) || getProcessEnv(key) || '';
};

/**
 * Supabase URL - checks all naming variations
 */
export const SUPABASE_URL =
  getEnv('VITE_SUPABASE_URL') ||
  getEnv('SUPABASE_URL') ||
  getEnv('SUPABASE_PROJECT_URL') ||
  '';

/**
 * Supabase Anon Key - checks all naming variations
 */
export const SUPABASE_ANON_KEY =
  getEnv('VITE_SUPABASE_ANON_KEY') ||
  getEnv('SUPABASE_ANON_KEY') ||
  '';

/**
 * Supabase Service Role Key (server only)
 */
export const SUPABASE_SERVICE_ROLE_KEY =
  getEnv('SUPABASE_SERVICE_ROLE_KEY') ||
  '';

/**
 * Check if Supabase environment is configured
 * Validates URL and key are present and not placeholders
 */
export const hasSupabaseEnv =
  SUPABASE_URL.length > 10 &&
  SUPABASE_ANON_KEY.length > 10 &&
  !SUPABASE_URL.includes('placeholder') &&
  !SUPABASE_URL.includes('your-project');

/**
 * Check if service role key is available
 */
export const hasServiceRoleKey = SUPABASE_SERVICE_ROLE_KEY.length > 10;

/**
 * Log configuration status safely
 * CRITICAL: Logs different vars for browser vs server to avoid false warnings
 */
export function logSupabaseEnv(prefix: string = '[Supabase Env]'): void {
  const isBrowser = typeof window !== 'undefined';
  const context = isBrowser ? 'browser' : 'server';

  if (isBrowser) {
    // Browser only cares about VITE_ vars
    console.log(
      `${prefix} ${context} | configured=${hasSupabaseEnv} | ` +
      `VITE_SUPABASE_URL=${SUPABASE_URL.length}ch | ` +
      `VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY.length}ch`
    );
  } else {
    // Server cares about SUPABASE_ vars (with or without VITE_ prefix)
    console.log(
      `${prefix} ${context} | configured=${hasSupabaseEnv} | ` +
      `urlLen=${SUPABASE_URL.length} | anonLen=${SUPABASE_ANON_KEY.length} | ` +
      `serviceKeyLen=${SUPABASE_SERVICE_ROLE_KEY.length} | ` +
      `hasServiceRole=${hasServiceRoleKey}`
    );
  }
}

// Log once on import
logSupabaseEnv('[Supabase Env]');
