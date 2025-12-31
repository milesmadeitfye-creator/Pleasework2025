/**
 * Meta Campaign Executor
 * Creates real Meta campaigns/adsets/ads via Marketing API
 * Mode: ABO (Ad Set Budget Optimization)
 */

import { getSupabaseAdmin } from "./_supabaseAdmin";
import {
  buildMetaCampaignPayload,
  buildMetaAdSetPayload,
  sanitizeAdSetPayload,
  sanitizeCampaignPayload,
  getPayloadDebugInfo,
} from "./_metaPayloadBuilders";

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
  adset_payload_preview?: any;
  adset_payload_debug?: {
    has_bid_amount: boolean;
    has_cost_cap: boolean;
    has_target_cost: boolean;
    has_bid_constraints: boolean;
    has_promoted_object: boolean;
    has_custom_event_type: boolean;
    bid_strategy: string;
    optimization_goal: string;
    billing_event: string;
  };
  ad_goal?: string;
  objective?: string;
  meta_request_summary?: {
    campaign?: {
      objective: string;
      has_budget: boolean;
      is_adset_budget_sharing_enabled: boolean;
      mode: string;
    };
    adset?: {
      optimization_goal: string;
      billing_event: string;
      bid_strategy: string;
      has_daily_budget: boolean;
      daily_budget_cents?: number;
      destination_type?: string;
      has_promoted_object: boolean;
      promoted_object_type?: string;
      mode: string;
    };
  };
}

/**
 * Map ad_goal to Meta objective
 */
function mapGoalToObjective(ad_goal: string): string {
  const g = (ad_goal || "").toLowerCase().trim();

  // Normalize common aliases
  const goal = g.replace(/\s+/g, "_").replace(/-/g, "_");

  // Meta "Outcome" objectives (modern)
  // If the rest of this function expects legacy objectives, we can adjust after build passes.
  switch (goal) {
    // Traffic / clicks
    case "link_clicks":
    case "traffic":
    case "website_traffic":
    case "landing_page_views":
      return "OUTCOME_TRAFFIC";

    // Awareness
    case "awareness":
    case "brand_awareness":
    case "reach":
      return "OUTCOME_AWARENESS";

    // Engagement
    case "engagement":
    case "post_engagement":
    case "page_likes":
    case "video_views":
    case "messages":
      return "OUTCOME_ENGAGEMENT";

    // Leads
    case "leads":
    case "lead_generation":
    case "instant_forms":
      return "OUTCOME_LEADS";

    // Sales / conversions
    case "conversions":
    case "purchases":
    case "sales":
    case "website_purchases":
      return "OUTCOME_SALES";

    // App
    case "app_installs":
    case "app":
    case "app_promotion":
      return "OUTCOME_APP_PROMOTION";

    default:
      // Safe fallback so we never crash campaign creation
      return "OUTCOME_TRAFFIC";
  }
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
 * Sanitize campaign payload before sending to Meta
 * Ensures required fields are present and valid
 */
function sanitizeCampaignPayload(payload: any): any {
  const sanitized = { ...payload };

  // Meta requires is_adset_budget_sharing_enabled to be explicitly set
  // For CBO mode (budget at campaign level), set to false
  if (!('is_adset_budget_sharing_enabled' in sanitized)) {
    sanitized.is_adset_budget_sharing_enabled = false;
  }

  // Ensure it's a boolean
  if (typeof sanitized.is_adset_budget_sharing_enabled !== 'boolean') {
    sanitized.is_adset_budget_sharing_enabled = false;
  }

  return sanitized;
}

/**
 * Sanitize adset payload before sending to Meta
 * Removes invalid fields based on ad_goal and campaign type
 */
function sanitizeAdsetPayload(payload: any, ad_goal: string): any {
  const sanitized = { ...payload };
  const goal = ad_goal.toLowerCase();

  // For traffic/link clicks goals: remove promoted_object entirely
  if (goal === 'link_clicks' || goal === 'traffic' || goal === 'streams' || goal === 'smart_link_probe') {
    delete sanitized.promoted_object;

    // Set correct optimization and billing for link clicks
    // Meta standard: IMPRESSIONS billing with LINK_CLICKS optimization
    sanitized.optimization_goal = 'LINK_CLICKS';
    sanitized.billing_event = 'IMPRESSIONS';
    sanitized.destination_type = 'WEBSITE';

    console.log('[sanitizeAdsetPayload] Traffic goal - removed promoted_object, set LINK_CLICKS optimization with IMPRESSIONS billing');
  }

  // Ensure bid_strategy is set (required to avoid error subcode 1815857)
  if (!sanitized.bid_strategy) {
    sanitized.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
  }

  // Remove bid_amount if present (we don't support bid caps yet)
  delete sanitized.bid_amount;

  // Remove legacy conversion fields if present
  if (sanitized.promoted_object) {
    delete sanitized.promoted_object.event_type;
    delete sanitized.promoted_object.custom_conversion_id;

    // Validate custom_event_type if present
    if (sanitized.promoted_object.custom_event_type) {
      if (!VALID_CUSTOM_EVENT_TYPES.includes(sanitized.promoted_object.custom_event_type)) {
        console.warn(
          `[sanitizeAdsetPayload] Invalid custom_event_type: ${sanitized.promoted_object.custom_event_type}, removing promoted_object`
        );
        delete sanitized.promoted_object;
      }
    }
  }

  return sanitized;
}

/**
 * Create Meta Campaign with Ad Set Budget Optimization (ABO)
 * @throws Error with Meta Graph API error details if creation fails
 */
async function createMetaCampaign(
  assets: MetaAssets,
  name: string,
  ad_goal: string
): Promise<{ id: string }> {
  // Build payload using single source of truth builder
  let body = buildMetaCampaignPayload({
    name,
    ad_goal,
  });

  // Final sanitization
  body = sanitizeCampaignPayload(body);

  console.log('[createMetaCampaign] Creating ABO campaign:', {
    objective: body.objective,
    is_adset_budget_sharing_enabled: body.is_adset_budget_sharing_enabled,
    has_budget: !!body.daily_budget || !!body.lifetime_budget,
    mode: 'ABO',
  });

  const data = await metaRequest<{ id: string }>(
    `/${assets.ad_account_id}/campaigns`,
    'POST',
    assets.access_token,
    body
  );

  console.log('[createMetaCampaign] ✅ ABO Campaign created:', data.id);
  return data;
}

/**
 * Create Meta Ad Set (ABO mode - budget at ad set level)
 * @throws Error with Meta Graph API error details if creation fails
 */
async function createMetaAdSet(
  assets: MetaAssets,
  campaignId: string,
  name: string,
  destinationUrl: string,
  ad_goal: string,
  daily_budget_cents: number,
  meta_status?: any
): Promise<{ id: string }> {
  // Build payload using single source of truth builder
  let body = buildMetaAdSetPayload({
    name,
    campaign_id: campaignId,
    ad_goal,
    daily_budget_cents,
    destination_url: destinationUrl,
    pixel_id: meta_status?.pixel_id,
    page_id: meta_status?.page_id,
  });

  // Final sanitization
  body = sanitizeAdsetPayload(body, ad_goal);

  // Generate debug info for error reporting
  const debugInfo = getPayloadDebugInfo(body);

  console.log('[createMetaAdSet] Creating ABO adset:', {
    campaign_id: campaignId,
    ad_goal,
    daily_budget: body.daily_budget,
    billing_event: body.billing_event,
    optimization_goal: body.optimization_goal,
    bid_strategy: body.bid_strategy,
    destination_type: body.destination_type || 'none',
    has_promoted_object: !!body.promoted_object,
    promoted_object: body.promoted_object || 'none',
    mode: 'ABO',
    debug: debugInfo,
  });

  const data = await metaRequest<{ id: string }>(
    `/${assets.ad_account_id}/adsets`,
    'POST',
    assets.access_token,
    body
  );

  console.log('[createMetaAdSet] ✅ ABO AdSet created:', data.id);
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

    // Step 2: Create Campaign with ABO (budget at ad set level)
    console.log('[executeMetaCampaign] Step 2/4: Creating Meta ABO campaign...');
    const objective = mapGoalToObjective(input.ad_goal);
    const campaignName = `Ghoste Campaign ${input.campaign_id.slice(0, 8)}`;

    // Build meta request summary for debugging
    const goal = input.ad_goal.toLowerCase();
    const isLinkClicksGoal = goal === 'link_clicks' || goal === 'traffic' || goal === 'streams' || goal === 'smart_link_probe';

    const meta_request_summary = {
      campaign: {
        objective,
        has_budget: false, // ABO mode - budget at ad set level
        is_adset_budget_sharing_enabled: false,
        mode: 'ABO',
      },
      adset: {
        optimization_goal: 'LINK_CLICKS',
        billing_event: 'IMPRESSIONS', // Meta standard for LINK_CLICKS optimization
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP', // No bid_amount required
        has_daily_budget: true, // ABO mode - budget at ad set level
        daily_budget_cents: input.daily_budget_cents,
        destination_type: isLinkClicksGoal ? 'WEBSITE' : undefined,
        has_promoted_object: !isLinkClicksGoal,
        promoted_object_type: !isLinkClicksGoal ? 'pixel' : undefined,
        mode: 'ABO',
      },
    };

    console.log('[executeMetaCampaign] Meta Request Summary:', JSON.stringify(meta_request_summary, null, 2));

    let campaign: { id: string };
    try {
      campaign = await createMetaCampaign(
        assets,
        campaignName,
        input.ad_goal // ABO mode - pass ad_goal instead of objective
      );
      console.log('[executeMetaCampaign] ✓ Created ABO campaign:', campaign.id);
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
        ad_goal: input.ad_goal,
        objective,
        meta_request_summary,
      };
    }

    // Step 3: Create Ad Set (ABO mode - budget at ad set level)
    console.log('[executeMetaCampaign] Step 3/4: Creating Meta ad set (ABO - with budget)...');
    const adsetName = `${campaignName} AdSet`;

    let adset: { id: string };
    let adset_payload_preview: any;
    let adset_payload_debug: any;
    try {
      // Build adset payload preview for debugging (before calling Meta)
      const previewPayload = buildMetaAdSetPayload({
        name: adsetName,
        campaign_id: campaign.id,
        ad_goal: input.ad_goal,
        daily_budget_cents: input.daily_budget_cents,
        destination_url: input.destination_url,
        pixel_id: input.metaStatus?.pixel_id,
        page_id: input.metaStatus?.page_id,
      });

      adset_payload_preview = {
        name: adsetName,
        campaign_id: campaign.id,
        daily_budget: String(input.daily_budget_cents),
        billing_event: previewPayload.billing_event,
        optimization_goal: previewPayload.optimization_goal,
        bid_strategy: previewPayload.bid_strategy,
        status: 'PAUSED',
        targeting: previewPayload.targeting,
        promoted_object: previewPayload.promoted_object || 'none',
        has_budget: true,
        ad_goal: input.ad_goal,
        mode: 'ABO',
      };

      // Generate debug info
      adset_payload_debug = getPayloadDebugInfo(previewPayload);

      adset = await createMetaAdSet(
        assets,
        campaign.id,
        adsetName,
        input.destination_url,
        input.ad_goal,
        input.daily_budget_cents, // ABO mode - pass budget to ad set
        input.metaStatus
      );
      console.log('[executeMetaCampaign] ✓ Created ABO adset:', adset.id);
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
        adset_payload_preview,
        adset_payload_debug,
        ad_goal: input.ad_goal,
        objective,
        meta_request_summary,
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
        adset_payload_preview,
        ad_goal: input.ad_goal,
        objective,
        meta_request_summary,
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
      adset_payload_preview,
      ad_goal: input.ad_goal,
      objective,
      meta_request_summary,
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
