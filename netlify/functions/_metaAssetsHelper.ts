/**
 * Helper for fetching user's selected Meta assets from database
 *
 * This module provides utilities to fetch the user's configured Meta assets
 * (Business, Page, Instagram, Ad Account, Pixel) from the user_meta_assets table.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export type UserMetaAssets = {
  id: string;
  user_id: string;
  meta_user_id: string | null;
  business_id: string | null;
  business_name: string | null;
  page_id: string | null;
  page_name: string | null;
  instagram_id: string | null;
  instagram_username: string | null;
  ad_account_id: string | null;
  ad_account_name: string | null;
  pixel_id: string | null;
  pixel_name: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Get user's selected Meta assets
 */
export async function getUserMetaAssets(userId: string): Promise<UserMetaAssets | null> {
  const { data, error } = await supabase
    .from('user_meta_assets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[getUserMetaAssets] Database error:', error);
    return null;
  }

  return data;
}

/**
 * Get user's selected ad account ID
 * Returns null if not configured
 */
export async function getUserAdAccountId(userId: string): Promise<string | null> {
  const assets = await getUserMetaAssets(userId);
  return assets?.ad_account_id || null;
}

/**
 * Get user's selected page ID
 * Returns null if not configured
 */
export async function getUserPageId(userId: string): Promise<string | null> {
  const assets = await getUserMetaAssets(userId);
  return assets?.page_id || null;
}

/**
 * Get user's selected Instagram ID
 * Returns null if not configured
 */
export async function getUserInstagramId(userId: string): Promise<string | null> {
  const assets = await getUserMetaAssets(userId);
  return assets?.instagram_id || null;
}

/**
 * Get user's selected Pixel ID
 * Returns null if not configured
 */
export async function getUserPixelId(userId: string): Promise<string | null> {
  const assets = await getUserMetaAssets(userId);
  return assets?.pixel_id || null;
}

/**
 * Check if user has configured Meta assets
 */
export async function hasUserMetaAssets(userId: string): Promise<boolean> {
  const assets = await getUserMetaAssets(userId);
  return !!(assets && (assets.business_id || assets.page_id || assets.ad_account_id));
}
