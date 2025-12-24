import type { Handler } from '@netlify/functions';

/**
 * Zero-dependency OAuth redirect shim for Meta.
 *
 * This function does NOT use Supabase or Meta SDKs directly.
 * It just receives the OAuth callback from Meta and bounces the user
 * into the SPA with the code & state preserved in the query string.
 *
 * All real work happens in /.netlify/functions/meta-connect-complete
 * which is called from the frontend after this redirect.
 */
export const handler: Handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const code = qs.code || '';
    const state = qs.state || '';
    const error = qs.error || '';
    const errorDescription = qs.error_description || '';

    console.log('[meta-auth-callback] Redirect received:', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
    });

    // If Meta returned an error, forward it to the completion page
    if (error) {
      console.error('[meta-auth-callback] Meta OAuth error:', error, errorDescription);
      const targetUrl = `/oauth-complete/meta?error=${encodeURIComponent(
        error
      )}&error_description=${encodeURIComponent(errorDescription)}`;

      return {
        statusCode: 302,
        headers: {
          Location: targetUrl,
        },
      };
    }

    // Redirect to popup completion page that will handle OAuth and notify parent window
    const redirectUrl = `/oauth-complete/meta?code=${encodeURIComponent(
      code
    )}&state=${encodeURIComponent(state)}`;

    console.log('[meta-auth-callback] Redirecting to OAuth completion page');

    return {
      statusCode: 302,
      headers: {
        Location: redirectUrl,
      },
    };
  } catch (err) {
    console.error('[meta-auth-callback] shim error', err);
    // Even in error, send user to completion page instead of crashing
    return {
      statusCode: 302,
      headers: {
        Location: '/oauth-complete/meta?error=callback_failed',
      },
    };
  }
};
