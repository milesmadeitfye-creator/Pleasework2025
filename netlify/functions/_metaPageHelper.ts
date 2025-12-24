/**
 * Helper to get Meta page information and access token for a user.
 * Reuses existing user_meta_connections table without requiring new tokens.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface MetaPageInfo {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramId?: string | null;
}

/**
 * Gets the first available Meta page for a user with a valid access token.
 * This reuses the existing Meta connection and fetches page info from Graph API.
 *
 * @param userId - The user's ID
 * @returns MetaPageInfo or null if no page is available
 */
export async function getMetaPageForUser(userId: string): Promise<MetaPageInfo | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log('[getMetaPageForUser] Fetching Meta connection for user:', userId.substring(0, 8) + '...');

  // Get Meta connection with user access token
  const { data: connection, error: connError } = await supabase
    .from('user_meta_connections')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (connError || !connection || !connection.access_token) {
    console.error('[getMetaPageForUser] No Meta connection found:', connError);
    return null;
  }

  const userAccessToken = connection.access_token;

  // Fetch pages from Graph API
  try {
    const url = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(
      userAccessToken
    )}`;

    console.log('[getMetaPageForUser] Fetching pages from Graph API');

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      console.error('[getMetaPageForUser] Graph API error:', data);
      return null;
    }

    if (!data.data || data.data.length === 0) {
      console.log('[getMetaPageForUser] No pages found for user');
      return null;
    }

    // Return the first page (user can manage multiple pages, but we'll use the first one for now)
    const page = data.data[0];

    console.log('[getMetaPageForUser] Found page:', {
      pageId: page.id,
      pageName: page.name,
      hasAccessToken: !!page.access_token,
      hasInstagram: !!page.instagram_business_account?.id,
    });

    return {
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
      instagramId: page.instagram_business_account?.id || null,
    };
  } catch (error: any) {
    console.error('[getMetaPageForUser] Error fetching pages:', error);
    return null;
  }
}

/**
 * Logs social post activity to the database for debugging
 * IMPORTANT: Never log access tokens or sensitive data
 */
export async function logSocialPostActivity({
  postId,
  userId,
  platform,
  step,
  status,
  message,
  payload,
}: {
  postId: string;
  userId: string;
  platform: string;
  step: string;
  status: 'success' | 'error';
  message?: string;
  payload?: any;
}): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // Strip any tokens from payload before logging
    const sanitizedPayload = payload ? JSON.parse(JSON.stringify(payload)) : {};
    if (sanitizedPayload.access_token) delete sanitizedPayload.access_token;
    if (sanitizedPayload.pageAccessToken) delete sanitizedPayload.pageAccessToken;

    await supabase.from('social_post_logs').insert({
      post_id: postId,
      user_id: userId,
      platform,
      step,
      status,
      message: message || null,
      payload: sanitizedPayload,
    });

    console.log(`[logSocialPostActivity] Logged ${status} for ${platform}/${step}`);
  } catch (error: any) {
    console.error('[logSocialPostActivity] Failed to log activity:', error);
    // Don't throw - logging failures shouldn't break the main flow
  }
}
