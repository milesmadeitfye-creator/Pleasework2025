export function computeRedirect(): string {
  const envRedirect = import.meta.env.VITE_OAUTH_REDIRECT as string | undefined;
  const site = (import.meta.env.VITE_SITE_URL as string | undefined)
    || (typeof window !== 'undefined' ? window.location.origin : '');

  let redirect = (envRedirect || (site ? site.replace(/\/$/,'') + '/auth/callback' : ''));

  // If we're on HTTPS and redirect includes localhost, force current origin
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && /(^|\/\/)localhost|127\.0\.0\.1/.test(redirect)) {
    redirect = window.location.origin.replace(/\/$/,'') + '/auth/callback';
  }
  return redirect;
}

// Legacy export for backward compatibility
export function getOAuthRedirect(): string {
  return computeRedirect();
}

/**
 * Get the confirmation redirect URL for Supabase email confirmation.
 * Always redirects to the production URL to ensure consistent behavior
 * across all environments (dev, preview, production).
 */
export const getConfirmRedirectUrl = (): string => {
  // Always send users to the live site confirm page
  return 'https://ghoste.one/confirm';
};
