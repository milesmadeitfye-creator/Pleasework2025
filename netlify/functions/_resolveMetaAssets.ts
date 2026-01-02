/**
 * CANONICAL META ASSET RESOLVER
 *
 * Single source of truth for resolving Meta assets for publishing campaigns.
 * ALL Meta ad publishing MUST use this resolver.
 *
 * This ensures manual and automated flows use identical asset resolution logic.
 */

import { getSupabaseAdmin } from './_supabaseAdmin';

export interface MetaAssets {
  access_token: string;
  ad_account_id: string;
  page_id: string | null;
  instagram_actor_id: string | null;
  pixel_id: string | null;
  has_required_assets: boolean;
}

export interface MetaConnectionStatus {
  auth_connected: boolean;
  assets_configured: boolean;
  ad_account_id: string | null;
  page_id: string | null;
  instagram_actor_id: string | null;
  pixel_id: string | null;
  missing_assets: string[] | null;
}

/**
 * Resolve Meta assets for a user using RPC (single source of truth)
 *
 * @param user_id - User ID
 * @param metaStatus - Optional pre-fetched RPC result (to avoid duplicate RPC calls)
 * @returns MetaAssets or null if not configured
 */
export async function resolveMetaAssets(
  user_id: string,
  metaStatus?: MetaConnectionStatus
): Promise<MetaAssets | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    console.error('[resolveMetaAssets] Supabase not configured');
    return null;
  }

  console.log('[resolveMetaAssets] ===== RESOLVING META ASSETS =====');
  console.log('[resolveMetaAssets] user_id:', user_id);
  console.log('[resolveMetaAssets] Has preloaded metaStatus:', !!metaStatus);

  try {
    // Step 1: Get connection status from tables directly (server-side admin query)
    // NOTE: RPC cannot be used server-side because it requires auth.uid() context
    if (!metaStatus) {
      console.log('[resolveMetaAssets] Querying Meta connection status from tables (server-side)...');

      // Query meta_credentials for ALL fields (access_token + asset IDs are in same table)
      const { data: credentials, error: credError } = await supabase
        .from('meta_credentials')
        .select('access_token, expires_at, ad_account_id, page_id, instagram_actor_id, pixel_id')
        .eq('user_id', user_id)
        .maybeSingle();

      if (credError) {
        console.error('[resolveMetaAssets] Error fetching credentials:', credError);
        return null;
      }

      console.log('[resolveMetaAssets] Credentials query result:', {
        found: !!credentials,
        hasToken: !!credentials?.access_token,
        hasAdAccount: !!credentials?.ad_account_id,
        hasPage: !!credentials?.page_id,
        hasInstagram: !!credentials?.instagram_actor_id,
        hasPixel: !!credentials?.pixel_id,
      });

      if (!credentials) {
        console.error('[resolveMetaAssets] No Meta credentials row found for user');
        return null;
      }

      // Build metaStatus object matching RPC schema
      const hasToken = !!credentials?.access_token;
      const tokenValid = credentials?.expires_at
        ? new Date(credentials.expires_at) > new Date()
        : true; // If no expiry, assume valid

      metaStatus = {
        auth_connected: hasToken && tokenValid,
        assets_configured: !!(credentials?.ad_account_id && credentials?.page_id),
        ad_account_id: credentials?.ad_account_id || null,
        page_id: credentials?.page_id || null,
        instagram_actor_id: credentials?.instagram_actor_id || null,
        pixel_id: credentials?.pixel_id || null,
        missing_assets: []
      };

      if (!credentials?.access_token) {
        console.error('[resolveMetaAssets] No access_token found in meta_credentials');
        return null;
      }
    }

    console.log('[resolveMetaAssets] metaStatus:', {
      auth_connected: metaStatus.auth_connected,
      assets_configured: metaStatus.assets_configured,
      ad_account_id: metaStatus.ad_account_id,
      page_id: metaStatus.page_id,
      instagram_actor_id: metaStatus.instagram_actor_id,
      pixel_id: metaStatus.pixel_id,
      missing_assets: metaStatus.missing_assets,
    });

    // Step 2: Validate Meta is ready
    if (!metaStatus.auth_connected) {
      console.error('[resolveMetaAssets] Meta not connected (auth_connected = false)');
      return null;
    }

    if (!metaStatus.assets_configured) {
      console.error('[resolveMetaAssets] Meta assets not configured:', {
        missing_assets: metaStatus.missing_assets,
      });
      return null;
    }

    // Step 3: Validate required assets (ad_account_id is ALWAYS required)
    if (!metaStatus.ad_account_id) {
      console.error('[resolveMetaAssets] Missing required asset: ad_account_id');
      return null;
    }

    // page_id is required for ad creatives
    if (!metaStatus.page_id) {
      console.error('[resolveMetaAssets] Missing required asset: page_id');
      return null;
    }

    console.log('[resolveMetaAssets] ✅ Validation passed - fetching access_token...');

    // Step 4: Fetch access_token from meta_credentials
    // NOTE: We need to fetch the token separately because metaStatus might have been pre-loaded
    // without the token (for security reasons in some contexts)
    const { data: creds, error: credsError } = await supabase
      .from('meta_credentials')
      .select('access_token')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsError) {
      console.error('[resolveMetaAssets] Database error fetching token:', credsError);
      return null;
    }

    if (!creds || !creds.access_token) {
      console.error('[resolveMetaAssets] No access token found in meta_credentials');
      return null;
    }

    console.log('[resolveMetaAssets] ✅ Access token fetched successfully');

    // Step 5: Build MetaAssets using validated data + access_token
    const assets: MetaAssets = {
      access_token: creds.access_token,
      ad_account_id: metaStatus.ad_account_id!,
      page_id: metaStatus.page_id!,
      instagram_actor_id: metaStatus.instagram_actor_id || null,
      pixel_id: metaStatus.pixel_id || null,
      has_required_assets: true, // We validated above
    };

    console.log('[resolveMetaAssets] ===== ✅ ASSETS RESOLVED SUCCESSFULLY =====');
    console.log('[resolveMetaAssets] Final assets:', {
      has_token: !!assets.access_token,
      token_length: assets.access_token.length,
      ad_account_id: assets.ad_account_id,
      page_id: assets.page_id,
      instagram_actor_id: assets.instagram_actor_id,
      pixel_id: assets.pixel_id,
      has_required_assets: assets.has_required_assets,
    });

    return assets;
  } catch (err: any) {
    console.error('[resolveMetaAssets] Exception:', err.message, err.stack);
    return null;
  }
}

/**
 * Validate required assets based on campaign type
 *
 * @param assets - Resolved Meta assets
 * @param requirePixel - Whether pixel is required (e.g., for conversion campaigns)
 * @param requireInstagram - Whether Instagram actor is required (e.g., for IG placements)
 * @returns Validation result with error message if invalid
 */
export function validateMetaAssets(
  assets: MetaAssets | null,
  options: {
    requirePixel?: boolean;
    requireInstagram?: boolean;
  } = {}
): { valid: boolean; error?: string; code?: string } {
  if (!assets) {
    return {
      valid: false,
      error: 'Meta assets not configured. Go to Profile → Meta/Facebook & Instagram and finish Configure Assets.',
      code: 'META_NOT_CONNECTED',
    };
  }

  if (!assets.has_required_assets) {
    return {
      valid: false,
      error: 'Required Meta assets missing. Please configure your Meta account.',
      code: 'META_ASSETS_INCOMPLETE',
    };
  }

  if (!assets.ad_account_id) {
    return {
      valid: false,
      error: 'No ad account selected. Please select an ad account in your Meta settings.',
      code: 'MISSING_AD_ACCOUNT',
    };
  }

  if (!assets.page_id) {
    return {
      valid: false,
      error: 'No Facebook page selected. Please select a page in your Meta settings.',
      code: 'MISSING_PAGE',
    };
  }

  if (options.requirePixel && !assets.pixel_id) {
    return {
      valid: false,
      error: 'No Meta pixel configured. Pixel is required for conversion campaigns.',
      code: 'MISSING_PIXEL',
    };
  }

  if (options.requireInstagram && !assets.instagram_actor_id) {
    return {
      valid: false,
      error: 'No Instagram account connected. Instagram account is required for IG placements.',
      code: 'MISSING_INSTAGRAM',
    };
  }

  return { valid: true };
}
