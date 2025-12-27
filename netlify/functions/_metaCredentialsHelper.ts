/**
 * SINGLE SOURCE OF TRUTH for Meta credentials
 *
 * All Meta integrations MUST use this helper.
 * Do NOT query meta_connections, user_meta_assets, or user_meta_connections directly.
 */

import { supabase } from './_supabaseAdmin';

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
