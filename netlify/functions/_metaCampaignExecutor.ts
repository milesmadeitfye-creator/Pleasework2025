/**
 * Meta Campaign Executor
 * Creates real Meta campaigns/adsets/ads via Marketing API
 */

import { getSupabaseAdmin } from "./_supabaseAdmin";

interface MetaAssets {
  access_token: string;
  ad_account_id: string;
  page_id?: string;
  instagram_actor_id?: string;
  pixel_id?: string;
}

interface CreateCampaignInput {
  user_id: string;
  campaign_id: string;
  ad_goal: string;
  daily_budget_cents: number;
  destination_url: string;
  creative_ids: string[];
  creative_urls?: string[];
  metaStatus?: any; // RPC result from get_meta_connection_status
}

interface MetaGraphError {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  error_user_title?: string;
  error_user_msg?: string;
  [key: string]: any;
}

interface MetaExecutionResult {
  success: boolean;
  meta_campaign_id?: string;
  meta_adset_id?: string;
  meta_ad_id?: string;
  error?: string;
  meta_error?: MetaGraphError;
  stage?: string;
  meta_permissions?: any;
  ad_account_info?: any;
}

/**
 * Generic Meta Graph API request handler with full error capture
 * @param path - API path (e.g., '/me/permissions' or '/${ad_account_id}/campaigns')
 * @param method - HTTP method
 * @param accessToken - Meta access token
 * @param body - Request body (optional)
 * @returns Response data or throws detailed error
 */
async function metaRequest<T = any>(
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  accessToken: string,
  body?: any
): Promise<T> {
  const url = `https://graph.facebook.com/v19.0${path}`;

  const fetchOptions: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (method === 'POST' && body) {
    fetchOptions.body = JSON.stringify({ ...body, access_token: accessToken });
  } else if (method === 'GET') {
    // Add access_token as query param for GET requests
    const separator = path.includes('?') ? '&' : '?';
    const urlWithToken = `${url}${separator}access_token=${accessToken}`;
    const res = await fetch(urlWithToken, fetchOptions);
    const data = await res.json();

    if (!res.ok || data.error) {
      const error: MetaGraphError = data.error || {
        message: `HTTP ${res.status}: ${res.statusText}`,
        code: res.status,
      };
      console.error('[metaRequest] Meta Graph API Error:', {
        path,
        method,
        status: res.status,
        error: error,
        // DO NOT log access_token
      });
      throw new Error(JSON.stringify(error));
    }

    return data as T;
  }

  // For POST requests
  const res = await fetch(url, fetchOptions);
  const data = await res.json();

  if (!res.ok || data.error) {
    const error: MetaGraphError = data.error || {
      message: `HTTP ${res.status}: ${res.statusText}`,
      code: res.status,
    };
    console.error('[metaRequest] Meta Graph API Error:', {
      path,
      method,
      status: res.status,
      error: error,
      // DO NOT log access_token or body (may contain token)
    });
    throw new Error(JSON.stringify(error));
  }

  return data as T;
}

/**
 * Fetch Meta assets for user using RPC status data
 * @param user_id - User ID
 * @param metaStatus - Result from get_meta_connection_status RPC (optional, will call RPC if not provided)
 */
async function fetchMetaAssets(user_id: string, metaStatus?: any): Promise<MetaAssets | null> {
  const supabase = getSupabaseAdmin();

  console.log('[fetchMetaAssets] ===== FETCHING META ASSETS =====');
  console.log('[fetchMetaAssets] user_id:', user_id);
  console.log('[fetchMetaAssets] Has metaStatus passed:', !!metaStatus);

  try {
    // If metaStatus not provided, this is a legacy call - should not happen with new code
    if (!metaStatus) {
      console.warn('[fetchMetaAssets] ⚠️ Called without metaStatus - using legacy check (NOT RECOMMENDED)');
      const { data, error } = await supabase.rpc('get_meta_connection_status');

      if (error || !data) {
        console.error('[fetchMetaAssets] ❌ RPC error:', error);
        return null;
      }

      metaStatus = data;
    }

    console.log('[fetchMetaAssets] metaStatus received:', {
      auth_connected: metaStatus.auth_connected,
      assets_configured: metaStatus.assets_configured,
      ad_account_id: metaStatus.ad_account_id,
      page_id: metaStatus.page_id,
      instagram_actor_id: metaStatus.instagram_actor_id,
      pixel_id: metaStatus.pixel_id,
    });

    // Verify Meta is ready (ONLY check RPC fields)
    if (!metaStatus.auth_connected || !metaStatus.assets_configured) {
      console.error('[fetchMetaAssets] ❌ Meta not ready per RPC:', {
        auth_connected: metaStatus.auth_connected,
        assets_configured: metaStatus.assets_configured,
        missing_assets: metaStatus.missing_assets,
      });
      return null;
    }

    console.log('[fetchMetaAssets] ✅ RPC validation passed - fetching access_token...');

    // Fetch ONLY access_token from meta_credentials (RPC provides everything else)
    const { data: creds, error: credsError } = await supabase
      .from('meta_credentials')
      .select('access_token')
      .eq('user_id', user_id)
      .maybeSingle();

    if (credsError) {
      console.error('[fetchMetaAssets] ❌ Database error fetching token:', credsError);
      return null;
    }

    if (!creds || !creds.access_token) {
      console.error('[fetchMetaAssets] ❌ No access token found in meta_credentials for user:', user_id);
      return null;
    }

    console.log('[fetchMetaAssets] ✅ Access token fetched successfully');

    // Build MetaAssets using RPC data + access_token
    const assets: MetaAssets = {
      access_token: creds.access_token,
      ad_account_id: metaStatus.ad_account_id,
      page_id: metaStatus.page_id || undefined,
      instagram_actor_id: metaStatus.instagram_actor_id || undefined,
      pixel_id: metaStatus.pixel_id || undefined,
    };

    console.log('[fetchMetaAssets] ===== ✅ ASSETS BUILT SUCCESSFULLY =====');
    console.log('[fetchMetaAssets] Final assets:', {
      has_token: !!assets.access_token,
      token_length: assets.access_token?.length,
      ad_account_id: assets.ad_account_id,
      page_id: assets.page_id,
      instagram_actor_id: assets.instagram_actor_id,
      pixel_id: assets.pixel_id,
    });

    return assets;
  } catch (err: any) {
    console.error('[fetchMetaAssets] ❌ Exception:', err.message, err.stack);
    return null;
  }
}

/**
 * Map ad_goal to Meta objective
 */
function mapGoalToObjective(ad_goal: string): string {
  const goalMap: Record<string, string> = {
    'link_clicks': 'OUTCOME_TRAFFIC',
    'conversions': 'OUTCOME_LEADS',
    'brand_awareness': 'OUTCOME_AWARENESS',
    'reach': 'OUTCOME_AWARENESS',
    'engagement': 'OUTCOME_ENGAGEMENT',
  };

  return goalMap[ad_goal.toLowerCase()] || 'OUTCOME_TRAFFIC';
}

/**
 * Create Meta Campaign
 * @throws Error with Meta Graph API error details if creation fails
 */
async function createMetaCampaign(
  assets: MetaAssets,
  name: string,
  objective: string
): Promise<{ id: string }> {
  const body = {
    name,
    objective,
    status: 'PAUSED',
    special_ad_categories: [],
  };

  console.log('[createMetaCampaign] Creating campaign with objective:', objective);
  const data = await metaRequest<{ id: string }>(
    `/${assets.ad_account_id}/campaigns`,
    'POST',
    assets.access_token,
    body
  );

  console.log('[createMetaCampaign] ✅ Campaign created:', data.id);
  return data;
}

/**
 * Create Meta Ad Set
 * @throws Error with Meta Graph API error details if creation fails
 */
async function createMetaAdSet(
  assets: MetaAssets,
  campaignId: string,
  name: string,
  dailyBudgetCents: number,
  destinationUrl: string
): Promise<{ id: string }> {
  const body: any = {
    name,
    campaign_id: campaignId,
    daily_budget: dailyBudgetCents.toString(),
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'LINK_CLICKS',
    status: 'PAUSED',
    targeting: {
      geo_locations: { countries: ['US'] },
      age_min: 18,
      age_max: 65,
    },
  };

  // Add pixel if available
  if (assets.pixel_id) {
    body.promoted_object = {
      pixel_id: assets.pixel_id,
      custom_event_type: 'LINK_CLICK',
    };
  }

  console.log('[createMetaAdSet] Creating adset for campaign:', campaignId);
  const data = await metaRequest<{ id: string }>(
    `/${assets.ad_account_id}/adsets`,
    'POST',
    assets.access_token,
    body
  );

  console.log('[createMetaAdSet] ✅ AdSet created:', data.id);
  return data;
}

/**
 * Create Meta Ad Creative and Ad
 * @throws Error with Meta Graph API error details if creation fails
 */
async function createMetaAd(
  assets: MetaAssets,
  adsetId: string,
  name: string,
  destinationUrl: string,
  creativeUrls: string[]
): Promise<{ id: string }> {
  // For now, use a simple link ad format
  // In production, you'd fetch the actual creative from storage and upload to Meta

  const creative: any = {
    name: `${name} Creative`,
    object_story_spec: {
      page_id: assets.page_id || assets.ad_account_id.replace('act_', ''),
      link_data: {
        link: destinationUrl,
        message: 'Check out this track!',
        call_to_action: {
          type: 'LEARN_MORE',
          value: {
            link: destinationUrl,
          },
        },
      },
    },
  };

  // If we have a creative URL, add it as image
  if (creativeUrls.length > 0) {
    creative.object_story_spec.link_data.image_hash = 'placeholder'; // Would need to upload first
  }

  const body = {
    name,
    adset_id: adsetId,
    creative,
    status: 'PAUSED',
  };

  console.log('[createMetaAd] Creating ad for adset:', adsetId);
  const data = await metaRequest<{ id: string }>(
    `/${assets.ad_account_id}/ads`,
    'POST',
    assets.access_token,
    body
  );

  console.log('[createMetaAd] ✅ Ad created:', data.id);
  return data;
}

/**
 * Execute full Meta campaign creation
 */
export async function executeMetaCampaign(
  input: CreateCampaignInput
): Promise<MetaExecutionResult> {
  console.log('[executeMetaCampaign] ===== STARTING META CAMPAIGN EXECUTION =====');
  console.log('[executeMetaCampaign] campaign_id:', input.campaign_id);
  console.log('[executeMetaCampaign] Has metaStatus:', !!input.metaStatus);

  try {
    // Step 1: Fetch Meta assets using RPC status
    console.log('[executeMetaCampaign] Step 1/4: Fetching Meta assets...');
    const assets = await fetchMetaAssets(input.user_id, input.metaStatus);
    if (!assets) {
      console.error('[executeMetaCampaign] ❌ fetchMetaAssets returned null');
      return {
        success: false,
        error: 'Meta assets not configured. Connect Meta in Profile → Connected Accounts.',
      };
    }

    console.log('[executeMetaCampaign] ✅ Assets loaded successfully:', {
      user_id: input.user_id,
      has_token: !!assets.access_token,
      ad_account_id: assets.ad_account_id,
      page_id: assets.page_id,
      instagram_actor_id: assets.instagram_actor_id,
      pixel_id: assets.pixel_id,
    });

    // Diagnostic calls before campaign creation
    console.log('[executeMetaCampaign] Running diagnostic checks...');
    let meta_permissions: any = null;
    let ad_account_info: any = null;

    try {
      console.log('[executeMetaCampaign] Checking /me/permissions...');
      meta_permissions = await metaRequest('/me/permissions', 'GET', assets.access_token);
      console.log('[executeMetaCampaign] ✅ Permissions:', meta_permissions);
    } catch (permErr: any) {
      console.warn('[executeMetaCampaign] ⚠️ Could not fetch permissions:', permErr.message);
      try {
        meta_permissions = { error: JSON.parse(permErr.message) };
      } catch {
        meta_permissions = { error: permErr.message };
      }
    }

    try {
      console.log('[executeMetaCampaign] Checking ad account info...');
      ad_account_info = await metaRequest(
        `/${assets.ad_account_id}?fields=account_status,disable_reason,spend_cap,amount_spent,currency,name`,
        'GET',
        assets.access_token
      );
      console.log('[executeMetaCampaign] ✅ Ad Account Info:', ad_account_info);
    } catch (acctErr: any) {
      console.warn('[executeMetaCampaign] ⚠️ Could not fetch ad account info:', acctErr.message);
      try {
        ad_account_info = { error: JSON.parse(acctErr.message) };
      } catch {
        ad_account_info = { error: acctErr.message };
      }
    }

    // Step 2: Create Campaign
    console.log('[executeMetaCampaign] Step 2/4: Creating Meta campaign...');
    const objective = mapGoalToObjective(input.ad_goal);
    const campaignName = `Ghoste Campaign ${input.campaign_id.slice(0, 8)}`;

    let campaign: { id: string };
    try {
      campaign = await createMetaCampaign(assets, campaignName, objective);
      console.log('[executeMetaCampaign] ✓ Created campaign:', campaign.id);
    } catch (campaignErr: any) {
      console.error('[executeMetaCampaign] ❌ Campaign creation failed:', campaignErr.message);
      let meta_error: MetaGraphError | undefined;
      try {
        meta_error = JSON.parse(campaignErr.message);
      } catch {
        meta_error = { message: campaignErr.message };
      }
      return {
        success: false,
        error: 'Meta Graph error during campaign creation',
        meta_error,
        stage: 'create_campaign',
        meta_permissions,
        ad_account_info,
      };
    }

    // Step 3: Create Ad Set
    console.log('[executeMetaCampaign] Step 3/4: Creating Meta ad set...');
    const adsetName = `${campaignName} AdSet`;

    let adset: { id: string };
    try {
      adset = await createMetaAdSet(
        assets,
        campaign.id,
        adsetName,
        input.daily_budget_cents,
        input.destination_url
      );
      console.log('[executeMetaCampaign] ✓ Created adset:', adset.id);
    } catch (adsetErr: any) {
      console.error('[executeMetaCampaign] ❌ AdSet creation failed:', adsetErr.message);
      let meta_error: MetaGraphError | undefined;
      try {
        meta_error = JSON.parse(adsetErr.message);
      } catch {
        meta_error = { message: adsetErr.message };
      }
      return {
        success: false,
        error: 'Meta Graph error during adset creation',
        meta_error,
        stage: 'create_adset',
        meta_campaign_id: campaign.id,
        meta_permissions,
        ad_account_info,
      };
    }

    // Step 4: Create Ad
    console.log('[executeMetaCampaign] Step 4/4: Creating Meta ad...');
    const adName = `${campaignName} Ad`;

    let ad: { id: string };
    try {
      ad = await createMetaAd(
        assets,
        adset.id,
        adName,
        input.destination_url,
        input.creative_urls || []
      );
      console.log('[executeMetaCampaign] ✓ Created ad:', ad.id);
    } catch (adErr: any) {
      console.error('[executeMetaCampaign] ❌ Ad creation failed:', adErr.message);
      let meta_error: MetaGraphError | undefined;
      try {
        meta_error = JSON.parse(adErr.message);
      } catch {
        meta_error = { message: adErr.message };
      }
      return {
        success: false,
        error: 'Meta Graph error during ad creation',
        meta_error,
        stage: 'create_ad',
        meta_campaign_id: campaign.id,
        meta_adset_id: adset.id,
        meta_permissions,
        ad_account_info,
      };
    }

    console.log('[executeMetaCampaign] ✅ Full campaign published to Meta:', {
      campaign: campaign.id,
      adset: adset.id,
      ad: ad.id,
    });

    return {
      success: true,
      meta_campaign_id: campaign.id,
      meta_adset_id: adset.id,
      meta_ad_id: ad.id,
      meta_permissions,
      ad_account_info,
    };
  } catch (err: any) {
    console.error('[executeMetaCampaign] ❌ Unexpected error:', err.message, err.stack);
    return {
      success: false,
      error: `Meta publish failed: ${err.message || 'Unknown error'}`,
      stage: 'unknown',
    };
  }
}
