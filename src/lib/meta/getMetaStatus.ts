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
 * Get Meta connection status for the current user (CANONICAL CLIENT HELPER)
 *
 * ALL client-side code MUST use this function to get Meta status.
 * NEVER call the RPC directly or query tables from the client.
 *
 * @param supabase - Supabase client instance (must be authenticated)
 * @returns MetaConnectionStatus object (never throws)
 */
export async function getMetaConnectionStatus(
  supabase: SupabaseClient
): Promise<MetaConnectionStatus> {
  try {
    console.log('[Meta Status] Fetching connection status via canonical RPC (NO ARGS)...');

    // Call canonical RPC with NO parameters
    // Uses auth.uid() internally - works for both Profile and All-in-One flows
    const { data, error } = await supabase.rpc('get_meta_connection_status');

    if (error) {
      console.error('[Meta Status] ❌ RPC error:', error);
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
      console.warn('[Meta Status] ⚠️ RPC returned null - Meta not connected');
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

    const metaStatus = {
      auth_connected: data.auth_connected ?? false,
      assets_configured: data.assets_configured ?? false,
      ad_account_id: data.ad_account_id || null,
      page_id: data.page_id || null,
      instagram_actor_id: data.instagram_actor_id || null,
      pixel_id: data.pixel_id || null,
      missing_assets: data.missing_assets || null,
    };

    console.log('[Meta Status] ✅ Connection status loaded:', {
      auth_connected: metaStatus.auth_connected,
      assets_configured: metaStatus.assets_configured,
      has_ad_account: !!metaStatus.ad_account_id,
      has_page: !!metaStatus.page_id,
      has_pixel: !!metaStatus.pixel_id,
      has_instagram: !!metaStatus.instagram_actor_id,
      missing_assets: metaStatus.missing_assets,
    });

    return metaStatus;
  } catch (err: any) {
    console.error('[Meta Status] 💥 Unexpected error:', err);
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

/**
 * Backward-compatible alias
 * @deprecated Use getMetaConnectionStatus instead for clarity
 */
export const getMetaStatus = getMetaConnectionStatus;
