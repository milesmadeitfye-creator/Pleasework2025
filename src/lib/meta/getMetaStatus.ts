/**
 * CANONICAL CLIENT-SIDE META STATUS CHECKER
 *
 * Single source of truth for Meta connection status on the client.
 * Uses RPC get_meta_connection_status as the authoritative data source.
 *
 * NEVER throws - always returns a safe result object.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface MetaConnectionStatus {
  auth_connected: boolean;
  assets_configured: boolean;
  ad_account_id: string | null;
  page_id: string | null;
  instagram_actor_id: string | null;
  pixel_id: string | null;
  missing_assets: string[] | null;
  error?: string;
}

/**
 * Get Meta connection status for the current user
 *
 * @param supabase - Supabase client instance (must be authenticated)
 * @returns MetaConnectionStatus object (never throws)
 */
export async function getMetaStatus(
  supabase: SupabaseClient
): Promise<MetaConnectionStatus> {
  try {
    console.log('[getMetaStatus] Fetching Meta connection status via RPC...');

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('[getMetaStatus] User not authenticated:', userError);
      return {
        auth_connected: false,
        assets_configured: false,
        ad_account_id: null,
        page_id: null,
        instagram_actor_id: null,
        pixel_id: null,
        missing_assets: null,
        error: 'User not authenticated',
      };
    }

    // Call RPC to get Meta connection status
    const { data, error } = await supabase
      .rpc('get_meta_connection_status', { input_user_id: user.id });

    if (error) {
      console.error('[getMetaStatus] RPC error:', error);
      return {
        auth_connected: false,
        assets_configured: false,
        ad_account_id: null,
        page_id: null,
        instagram_actor_id: null,
        pixel_id: null,
        missing_assets: null,
        error: error.message || 'Failed to fetch Meta status',
      };
    }

    if (!data) {
      console.warn('[getMetaStatus] RPC returned null - Meta not connected');
      return {
        auth_connected: false,
        assets_configured: false,
        ad_account_id: null,
        page_id: null,
        instagram_actor_id: null,
        pixel_id: null,
        missing_assets: null,
        error: 'Meta not connected',
      };
    }

    console.log('[getMetaStatus] ✅ Meta status fetched:', {
      auth_connected: data.auth_connected,
      assets_configured: data.assets_configured,
      has_ad_account: !!data.ad_account_id,
      has_page: !!data.page_id,
      has_pixel: !!data.pixel_id,
      has_instagram: !!data.instagram_actor_id,
    });

    return {
      auth_connected: data.auth_connected ?? false,
      assets_configured: data.assets_configured ?? false,
      ad_account_id: data.ad_account_id || null,
      page_id: data.page_id || null,
      instagram_actor_id: data.instagram_actor_id || null,
      pixel_id: data.pixel_id || null,
      missing_assets: data.missing_assets || null,
    };
  } catch (err: any) {
    console.error('[getMetaStatus] Unexpected error:', err);
    return {
      auth_connected: false,
      assets_configured: false,
      ad_account_id: null,
      page_id: null,
      instagram_actor_id: null,
      pixel_id: null,
      missing_assets: null,
      error: err?.message || 'Unexpected error fetching Meta status',
    };
  }
}
