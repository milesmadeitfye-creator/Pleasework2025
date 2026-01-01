/**
 * SINGLE SOURCE OF TRUTH for Meta credentials
 *
 * All Meta integrations MUST use this helper.
 * Do NOT query meta_connections, user_meta_assets, or user_meta_connections directly.
 */

import { getSupabaseAdmin } from './_supabaseAdmin';

export interface MetaCredentials {
  accessToken: string;
  adAccountId: string | null;
  pageId: string | null;
  pixelId: string | null;
  instagramAccountId: string | null;
  userId: string;
  createdAt: string;
}

/**
 * Get Meta credentials for a user
 *
 * @throws Error if Meta not connected or token missing
 */
export async function getMetaCredentials(userId: string): Promise<MetaCredentials> {
  console.log('[getMetaCredentials] Fetching for user:', userId);

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase not configured - cannot fetch Meta credentials');
  }

  const { data, error } = await supabase
    .from('meta_credentials')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[getMetaCredentials] Query error:', error);
    throw new Error(`Failed to fetch Meta credentials: ${error.message}`);
  }

  if (!data) {
    console.warn('[getMetaCredentials] No credentials found for user:', userId);
    throw new Error('Meta not connected. Please connect your Meta account in Profile → Connected Accounts.');
  }

  if (!data.access_token) {
    console.error('[getMetaCredentials] Access token missing for user:', userId);
    throw new Error('Meta access token missing. Please reconnect your Meta account.');
  }

  console.log('[getMetaCredentials] Found credentials:', {
    userId: data.user_id,
    hasToken: !!data.access_token,
    adAccountId: data.ad_account_id,
    pageId: data.page_id,
    pixelId: data.pixel_id,
    instagramAccountId: data.instagram_account_id,
  });

  return {
    accessToken: data.access_token,
    adAccountId: data.ad_account_id,
    pageId: data.page_id,
    pixelId: data.pixel_id,
    instagramAccountId: data.instagram_account_id,
    userId: data.user_id,
    createdAt: data.created_at,
  };
}

/**
 * Check if user has Meta connected
 */
export async function isMetaConnected(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('meta_credentials')
    .select('access_token')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return !!(data && data.access_token);
}

/**
 * Get Meta credentials safely (returns null if not connected)
 */
export async function getMetaCredentialsSafe(userId: string): Promise<MetaCredentials | null> {
  try {
    return await getMetaCredentials(userId);
  } catch (error) {
    console.log('[getMetaCredentialsSafe] User not connected:', userId);
    return null;
  }
}

/**
 * Server-only Meta credentials loader with snake_case format.
 * Used by meta-audiences-ensure and other functions expecting snake_case fields.
 */
export async function fetchMetaCredentials(
  userId: string
): Promise<{
  access_token: string | null;
  ad_account_id?: string | null;
  page_id?: string | null;
  pixel_id?: string | null;
  instagram_actor_id?: string | null;
  user_id?: string | null;
}> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    throw new Error('Supabase not configured - cannot fetch Meta credentials');
  }

  // Try safe view first if it exists
  const safe = await supabase
    .from('meta_credentials_safe')
    .select(
      'access_token, ad_account_id, page_id, pixel_id, instagram_actor_id, user_id'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (!safe.error && safe.data?.access_token) {
    return {
      access_token: safe.data.access_token,
      ad_account_id: safe.data.ad_account_id,
      page_id: safe.data.page_id,
      pixel_id: safe.data.pixel_id,
      instagram_actor_id: safe.data.instagram_actor_id,
      user_id: safe.data.user_id,
    };
  }

  // Fallback to raw table (service role allowed)
  const raw = await supabase
    .from('meta_credentials')
    .select(
      'access_token, ad_account_id, page_id, pixel_id, instagram_actor_id, user_id'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (raw.error) {
    throw new Error(
      `Failed to load meta credentials: ${raw.error.message}`
    );
  }

  if (!raw.data?.access_token) {
    throw new Error('Meta not connected (missing access_token)');
  }

  return {
    access_token: raw.data.access_token,
    ad_account_id: raw.data.ad_account_id,
    page_id: raw.data.page_id,
    pixel_id: raw.data.pixel_id,
    instagram_actor_id: raw.data.instagram_actor_id,
    user_id: raw.data.user_id,
  };
}
