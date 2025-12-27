// netlify/functions/_supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL) {
  throw new Error(
    "[Supabase Admin] SUPABASE_URL is not set in Netlify environment variables. " +
    "Check Netlify Dashboard → Site Settings → Environment Variables"
  );
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "[Supabase Admin] SUPABASE_SERVICE_ROLE_KEY is not set in Netlify environment variables. " +
    "Check Netlify Dashboard → Site Settings → Environment Variables"
  );
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Legacy export for backward compatibility
export function getSupabaseAdmin() {
  return supabaseAdmin;
}

// Alias for consistency with function naming
export function getSupabaseAdminClient() {
  return supabaseAdmin;
}

/**
 * Get Meta access token for a user from user_meta_connections table.
 * Falls back to system token if user token not found.
 *
 * This ensures API calls are attributed to real users for Meta App Review.
 */
export async function getMetaAccessTokenForUser(
  userId: string
): Promise<{ token: string; source: 'user' | 'system' }> {
  const { data, error } = await supabaseAdmin
    .from('user_meta_connections')
    .select('access_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    console.warn(
      `[getMetaAccessTokenForUser] No user Meta token found for ${userId}, falling back to system token`,
      error
    );

    // Fallback to system token
    const systemToken = process.env.META_ACCESS_TOKEN || process.env.META_SYSTEM_USER_TOKEN;
    if (!systemToken) {
      throw new Error('No Meta user token and no system token configured');
    }

    return { token: systemToken, source: 'system' };
  }

  // TODO: Check if token is expired and refresh if needed
  // For now, just log if it's expiring soon
  if (data.expires_at) {
    const expiresAt = new Date(data.expires_at);
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (expiresAt < sevenDaysFromNow) {
      console.warn(
        `[getMetaAccessTokenForUser] Token for ${userId} expires soon (${expiresAt}), should prompt reconnect`
      );
    }
  }

  return { token: data.access_token as string, source: 'user' };
}
