/**
 * Auth Error Guard
 *
 * Handles fatal authentication errors gracefully on iOS Safari
 * where invalid refresh tokens cause cascading "Load failed" errors.
 */

import { supabase } from '@/lib/supabase.client';

/**
 * Handle fatal auth errors that require re-authentication
 * Returns true if error was handled (user redirected)
 */
export async function handleAuthFatalIfNeeded(err: any): Promise<boolean> {
  if (!err) return false;

  const code = err?.code || err?.error?.code || err?.status || err?.name;
  const msg = String(err?.message || '').toLowerCase();

  // Check for refresh token errors
  const isRefreshTokenMissing =
    code === 'refresh_token_not_found' ||
    msg.includes('refresh token not found') ||
    msg.includes('invalid refresh token') ||
    msg.includes('refresh_token_not_found') ||
    msg.includes('jwt expired') ||
    code === 'PGRST301';

  if (isRefreshTokenMissing) {
    console.warn('[AuthGuard] Invalid/expired session detected, signing out');

    // Sign out (swallow any errors)
    try {
      await supabase.auth.signOut();
    } catch (signOutError) {
      console.warn('[AuthGuard] Sign out error:', signOutError);
    }

    // Clear local storage tokens
    try {
      localStorage.removeItem('supabase.auth.token');
      localStorage.removeItem('ghoste_session');
      // Clear any other auth-related keys
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('sb-') || key.includes('auth')) {
          try {
            localStorage.removeItem(key);
          } catch {}
        }
      });
    } catch (storageError) {
      console.warn('[AuthGuard] Storage cleanup error:', storageError);
    }

    // Redirect to auth page with reason
    if (typeof window !== 'undefined') {
      window.location.href = '/auth?reason=session_expired';
    }

    return true;
  }

  return false;
}

/**
 * Wrap async auth operations with error handling
 * Returns [data, error] tuple - never throws
 */
export async function safeAuthCall<T>(
  operation: () => Promise<T>,
  defaultValue: T
): Promise<[T, Error | null]> {
  try {
    const result = await operation();
    return [result, null];
  } catch (err: any) {
    const handled = await handleAuthFatalIfNeeded(err);
    if (!handled) {
      console.warn('[AuthGuard] Auth operation failed:', err?.message || err);
    }
    return [defaultValue, err];
  }
}

/**
 * Check if an error is auth-related and should trigger re-login
 */
export function isAuthError(err: any): boolean {
  if (!err) return false;

  const code = err?.code || err?.error?.code || err?.status;
  const msg = String(err?.message || '').toLowerCase();

  return (
    code === 'PGRST301' ||
    code === 'refresh_token_not_found' ||
    code === 401 ||
    code === 403 ||
    msg.includes('jwt') ||
    msg.includes('token') ||
    msg.includes('unauthorized') ||
    msg.includes('authentication')
  );
}

/**
 * Safe session getter - never throws, handles expired tokens
 */
export async function getSafeSession() {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      await handleAuthFatalIfNeeded(error);
      return null;
    }

    return data.session;
  } catch (err) {
    await handleAuthFatalIfNeeded(err);
    return null;
  }
}
