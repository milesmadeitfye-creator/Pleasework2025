/**
 * Central Environment Variable Resolver
 *
 * SINGLE SOURCE OF TRUTH for all env var access.
 * Supports multiple naming schemes across Netlify deployments.
 * Never uses placeholder URLs - returns null if missing.
 */

// Detect runtime environment
const isBrowser = typeof window !== 'undefined';
const isServer = !isBrowser;

/**
 * Get public Supabase URL (for browser/client)
 * Reads: VITE_SUPABASE_URL
 */
export function getPublicSupabaseUrl(): string | null {
  if (!isBrowser) {
    console.warn('[env] getPublicSupabaseUrl called from server context');
    return null;
  }

  const url = import.meta.env?.VITE_SUPABASE_URL;

  if (!url) {
    return null;
  }

  // Reject placeholder URLs
  if (url.includes('placeholder')) {
    console.error('[env] Placeholder URL detected, treating as missing');
    return null;
  }

  return url as string;
}

/**
 * Get public Supabase anon key (for browser/client)
 * Reads: VITE_SUPABASE_ANON_KEY
 */
export function getPublicSupabaseAnonKey(): string | null {
  if (!isBrowser) {
    console.warn('[env] getPublicSupabaseAnonKey called from server context');
    return null;
  }

  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  return key ? (key as string) : null;
}

/**
 * Get server Supabase URL (for Netlify functions)
 * Reads: SUPABASE_URL or VITE_SUPABASE_URL (fallback)
 */
export function getServerSupabaseUrl(): string | null {
  if (isBrowser) {
    console.warn('[env] getServerSupabaseUrl called from browser context');
    return null;
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

  if (!url) {
    return null;
  }

  // Reject placeholder URLs
  if (url.includes('placeholder')) {
    console.error('[env] Placeholder URL detected, treating as missing');
    return null;
  }

  return url;
}

/**
 * Get server Supabase service role key (for Netlify functions)
 * Reads: SUPABASE_SERVICE_ROLE_KEY (preferred)
 */
export function getServerSupabaseServiceRoleKey(): string | null {
  if (isBrowser) {
    console.warn('[env] getServerSupabaseServiceRoleKey called from browser');
    return null;
  }

  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

/**
 * Get server Supabase anon key (fallback for functions)
 * Reads: SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY
 */
export function getServerSupabaseAnonKey(): string | null {
  if (isBrowser) {
    console.warn('[env] getServerSupabaseAnonKey called from browser');
    return null;
  }

  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || null;
}

/**
 * Check if public Supabase is configured
 */
export function isPublicSupabaseConfigured(): boolean {
  return !!(getPublicSupabaseUrl() && getPublicSupabaseAnonKey());
}

/**
 * Check if server Supabase is configured
 * Requires URL + (service role key OR anon key)
 */
export function isServerSupabaseConfigured(): boolean {
  const url = getServerSupabaseUrl();
  const serviceKey = getServerSupabaseServiceRoleKey();
  const anonKey = getServerSupabaseAnonKey();

  return !!(url && (serviceKey || anonKey));
}

/**
 * Log current configuration (safe for production - no secrets)
 */
export function logEnvConfig(prefix: string = '[env]'): void {
  if (isBrowser) {
    const url = getPublicSupabaseUrl();
    const key = getPublicSupabaseAnonKey();
    console.log(
      `${prefix} Browser: configured=${isPublicSupabaseConfigured()} | urlLen=${url?.length ?? 0} | anonLen=${key?.length ?? 0}`
    );
  } else {
    const url = getServerSupabaseUrl();
    const serviceKey = getServerSupabaseServiceRoleKey();
    const anonKey = getServerSupabaseAnonKey();
    console.log(
      `${prefix} Server: configured=${isServerSupabaseConfigured()} | urlLen=${url?.length ?? 0} | serviceLen=${serviceKey?.length ?? 0} | anonLen=${anonKey?.length ?? 0}`
    );
  }
}
