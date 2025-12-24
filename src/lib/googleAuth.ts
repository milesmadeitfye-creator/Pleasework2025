import { supabase } from './supabase';

/**
 * Gets Google OAuth tokens from the current Supabase session
 * Returns both the Google access token and the Supabase JWT
 */
export async function getGoogleTokens(): Promise<{
  accessToken: string | null;
  supabaseJwt: string | null;
}> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      console.warn('[getGoogleTokens] No active session');
      return { accessToken: null, supabaseJwt: null };
    }

    return {
      accessToken: session.provider_token || null,
      supabaseJwt: session.access_token || null,
    };
  } catch (error) {
    console.error('[getGoogleTokens] Error getting session:', error);
    return { accessToken: null, supabaseJwt: null };
  }
}
