import { getSupabaseAdmin } from '../_supabaseAdmin';

/**
 * Get the Meta access token for a user
 *
 * @param userId - The user's UUID
 * @returns The Meta access token or null if not connected
 */
export async function getMetaAccessToken(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('meta_credentials')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[metaAuth] Error fetching access token:', error);
    return null;
  }

  return data?.access_token || null;
}

/**
 * Get full Meta credentials for a user
 *
 * @param userId - The user's UUID
 * @returns The Meta credentials or null if not connected
 */
export async function getMetaCredentials(userId: string) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('meta_credentials')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[metaAuth] Error fetching credentials:', error);
    return null;
  }

  return data;
}

/**
 * Check if a user has a valid Meta connection
 *
 * @param userId - The user's UUID
 * @returns True if user has a valid access token
 */
export async function hasMetaConnection(userId: string): Promise<boolean> {
  const token = await getMetaAccessToken(userId);
  return !!token;
}
