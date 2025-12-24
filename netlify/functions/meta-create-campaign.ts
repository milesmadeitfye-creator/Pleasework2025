import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getMetaContextForUser } from "./_metaContext";
import { applyBiddingStrategy, logAdsetBiddingFields } from "./_metaBiddingSanitizer";
import {
  getInstagramActorIdForUser,
  removeInstagramPlacements,
  wantsInstagramPlacements,
} from "./_metaInstagramHelper";
import {
  getMetaCustomConversions,
  searchMetaInterests,
  uploadMetaImage,
  uploadMetaVideo,
  createMetaCampaign,
  createMetaAdSet,
  createMetaAdCreative,
  createMetaAd,
  normalizeAdAccountId,
} from "./_metaClient";

type MetaCustomConversion = {
  id: string;
  name?: string;
  pixel?: { id?: string } | null;
};

/**
 * Helper: Defines placement choice from UI
 */
type PlacementChoice = {
  includeInstagram?: boolean; // explicit flag from UI
  includeFacebook?: boolean;  // default true
};

/**
 * Helper: Build Meta placements based on explicit UI choice
 * CRITICAL: If includeInstagram is false, Instagram MUST NOT be included anywhere
 */
function buildPlacements(choice: PlacementChoice) {
  const includeFacebook = choice.includeFacebook !== false; // default true
  const includeInstagram = choice.includeInstagram === true; // must be explicitly true

  const publisher_platforms: string[] = [];
  if (includeFacebook) publisher_platforms.push("facebook");
  if (includeInstagram) publisher_platforms.push("instagram");

  const facebook_positions = includeFacebook
    ? ["feed", "story", "marketplace", "video_feeds", "search", "facebook_reels"]
    : [];

  // IMPORTANT: if IG is off, instagram_positions MUST be empty array
  const instagram_positions = includeInstagram
    ? ["stream", "story", "reels", "explore"]
    : [];

  return { publisher_platforms, facebook_positions, instagram_positions };
}

/**
 * Helper: Extract Instagram actor ID from meta_credentials
 * Supports multiple field names and JSONB array structure
 */
function pickInstagramActorId(metaCreds: any): string | null {
  if (!metaCreds) return null;

  // Priority 1: Direct text fields
  const fromDirect =
    metaCreds?.instagram_actor_id ||
    metaCreds?.instagramActorId ||
    metaCreds?.instagram_user_id ||
    metaCreds?.instagram_id ||
    null;

  if (fromDirect && typeof fromDirect === 'string' && fromDirect.trim().length > 0) {
    return fromDirect.trim();
  }

  // Priority 2: JSONB array (instagram_accounts, instagramAccounts, connected_instagram_accounts)
  const arr =
    metaCreds?.instagram_accounts ||
    metaCreds?.instagramAccounts ||
    metaCreds?.connected_instagram_accounts ||
    [];

  if (Array.isArray(arr) && arr.length > 0) {
    const first = arr[0];
    const id = first?.id || first?.instagram_id || first?.ig_user_id;
    if (id && typeof id === 'string' && id.trim().length > 0) {
      return id.trim();
    }
  }

  return null;
}

/**
 * Helper: Normalize placements to remove deprecated values
 * CRITICAL: Meta deprecated "video_feeds" - replace with "facebook_reels" + "feed"
 */
function normalizePlacements(input: {
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  messenger_positions?: string[];
  audience_network_positions?: string[];
}) {
  const out = {
    publisher_platforms: input.publisher_platforms ?? [],
    facebook_positions: input.facebook_positions ? [...input.facebook_positions] : [],
    instagram_positions: input.instagram_positions ? [...input.instagram_positions] : [],
    messenger_positions: input.messenger_positions ? [...input.messenger_positions] : [],
    audience_network_positions: input.audience_network_positions ? [...input.audience_network_positions] : [],
  };

  // Meta deprecation: "video_feeds" is rejected on newer API versions
  const hadVideoFeeds = out.facebook_positions.includes("video_feeds");

  if (hadVideoFeeds) {
    console.log("[MetaPlacements] ⚠️ video_feeds detected (deprecated)");
    out.facebook_positions = out.facebook_positions.filter(p => p !== "video_feeds");

    // Preserve "video style" intent without breaking API:
    if (!out.facebook_positions.includes("facebook_reels")) {
      out.facebook_positions.push("facebook_reels");
      console.log("[MetaPlacements] ✅ Added facebook_reels as replacement");
    }
    if (!out.facebook_positions.includes("feed")) {
      out.facebook_positions.push("feed");
      console.log("[MetaPlacements] ✅ Added feed as fallback");
    }

    console.log("[MetaPlacements] video_feeds deprecated → mapped to facebook_reels + feed");
  }

  console.log("[MetaPlacements] final:", {
    publisher_platforms: out.publisher_platforms,
    facebook_positions: out.facebook_positions,
    instagram_positions: out.instagram_positions,
  });

  return out;
}

/**
 * Finds the ghostelinkclick custom conversion for the ad account.
 * Looks for conversions named "ghostelinkclick" or "ghoste_link_click" (case-insensitive).
 */
async function findGhosteLinkClickConversion(params: {
  adAccountId: string;
  accessToken: string;
}): Promise<{ customConversion: MetaCustomConversion | null }> {
  const { adAccountId, accessToken } = params;

  console.log('[findGhosteLinkClickConversion] Searching for ghostelinkclick custom conversion');

  const data: any = await getMetaCustomConversions({ adAccountId, accessToken });
  const list = (data?.data || []) as MetaCustomConversion[];

  console.log('[findGhosteLinkClickConversion] Found custom conversions:', list.length);

  const match = list.find((cc) => {
    const name = (cc.name || '').toLowerCase();
    return (
      name === 'ghostelinkclick' ||
      name === 'ghoste_link_click' ||
      (name.includes('ghoste') && name.includes('link') && name.includes('click'))
    );
  });

  if (match) {
    console.log('[findGhosteLinkClickConversion] Found match:', {
      id: match.id,
      name: match.name,
      pixelId: match.pixel?.id,
    });
  } else {
    console.log('[findGhosteLinkClickConversion] No ghostelinkclick conversion found');
  }

  return { customConversion: match || null };
}

/**
 * Removes unsupported image_url field from object_story_spec link_data.
 * Meta requires image_hash instead of image_url in link_data.
 * IMPORTANT: Does NOT remove image_url from video_data (required for video thumbnails).
 */
function stripImageUrlFromStorySpec(creativePayload: any): any {
  if (!creativePayload) return creativePayload;
  const cloned = { ...creativePayload };

  const oss = cloned.object_story_spec;
  // Only strip from link_data, NOT from video_data (video_data REQUIRES image_url for thumbnail)
  if (oss && oss.link_data && 'image_url' in oss.link_data) {
    delete oss.link_data.image_url;
  }

  return cloned;
}

// searchMetaInterests now imported from _metaClient

/**
 * Removes Singapore from targeting to avoid regional declaration requirements.
 * Meta requires SINGAPORE_UNIVERSAL declaration for ads targeting Singapore,
 * which we don't want to deal with right now.
 */
function stripSingaporeFromTargeting(targeting: any): any {
  if (!targeting) return targeting;

  const cloned = { ...targeting };

  // Remove Singapore from countries list
  if (cloned.geo_locations && Array.isArray(cloned.geo_locations.countries)) {
    cloned.geo_locations = {
      ...cloned.geo_locations,
      countries: cloned.geo_locations.countries.filter(
        (c: string) => c !== 'SG' && c !== 'Singapore' && c !== 'SINGAPORE'
      ),
    };
  }

  // Remove Singapore from excluded countries (just in case)
  if (
    cloned.excluded_geo_locations &&
    Array.isArray(cloned.excluded_geo_locations.countries)
  ) {
    cloned.excluded_geo_locations = {
      ...cloned.excluded_geo_locations,
      countries: cloned.excluded_geo_locations.countries.filter(
        (c: string) => c !== 'SG' && c !== 'Singapore' && c !== 'SINGAPORE'
      ),
    };
  }

  return cloned;
}

// uploadMetaImage now imported from _metaClient

// uploadMetaVideo now imported from _metaClient

/**
 * Logs debug information to Supabase for troubleshooting Meta API calls
 */
async function logDebug({
  supabase,
  userId,
  step,
  payload,
  response,
  errorMessage,
  metaCampaignId,
  metaAdsetId,
  metaCreativeId,
  metaAdId,
}: {
  supabase: any;
  userId: string;
  step: string;
  payload?: any;
  response?: any;
  errorMessage?: string;
  metaCampaignId?: string;
  metaAdsetId?: string;
  metaCreativeId?: string;
  metaAdId?: string;
}): Promise<void> {
  try {
    await supabase.from('meta_ad_debug_logs').insert({
      user_id: userId,
      step,
      payload_json: payload || {},
      response_json: response || {},
      error_message: errorMessage || null,
      meta_campaign_id: metaCampaignId || null,
      meta_adset_id: metaAdsetId || null,
      meta_creative_id: metaCreativeId || null,
      meta_ad_id: metaAdId || null,
    });
  } catch (logErr) {
    console.error('[logDebug] Failed to log debug info:', logErr);
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// System-level Meta credentials (fallback if user doesn't have their own)
const SYSTEM_ACCESS_TOKEN =
  process.env.META_USER_ACCESS_TOKEN ||
  process.env.META_ACCESS_TOKEN;
const SYSTEM_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  };
}

/**
 * Normalize Facebook placement values for Meta API
 * UI uses 'reels' but API expects 'facebook_reels'
 */
function normalizeFacebookPositions(positions?: string[] | null): string[] | undefined {
  if (!positions) return positions ?? undefined;

  return positions.map((p) => {
    // UI uses 'reels' for Facebook Reels, API expects 'facebook_reels'
    if (p === 'reels') return 'facebook_reels';
    return p;
  });
}

/**
 * Normalize Instagram placement values for Meta API
 * UI uses 'search' but API expects 'ig_search'
 */
function normalizeInstagramPositions(positions?: string[] | null): string[] | undefined {
  if (!positions) return positions ?? undefined;

  return positions.map((p) => {
    // UI uses 'search' for Instagram search; API expects 'ig_search'
    if (p === 'search') return 'ig_search';

    // Keep all other known placements as-is:
    // 'stream', 'story', 'explore', 'explore_home',
    // 'reels', 'profile_feed', 'profile_reels', 'ig_search'
    return p;
  });
}

interface Creative {
  index: number;
  url: string;
  imageHash?: string;
  videoUrl?: string;
  video_url?: string;
  video_file_url?: string;
  fileType?: string | null;
  thumbnailUrl?: string; // Optional thumbnail for video ads
}

interface RequestBody {
  campaignName: string;
  adAccountId: string;
  pageId: string;
  instagramId?: string | null;
  dailyBudget: string;
  lifetimeBudget?: string; // NEW: For Smart Link Campaign preset
  campaignType?: 'traffic' | 'smart_link_campaign'; // NEW: Campaign type selector
  linkUrl: string;
  headline: string;
  primaryText: string;
  description?: string;
  targetingCountries: string[];
  creatives: Creative[];
  placementMode?: 'automatic' | 'manual';
  placement?: {
    publisherPlatforms: string[];
    facebookPositions: string[];
    instagramPositions: string[];
  };
  // NEW: Explicit Instagram inclusion flag from UI
  placements?: {
    includeInstagram?: boolean;
    includeFacebook?: boolean;
  };
  includeInstagram?: boolean; // Also support top-level flag
  no_instagram?: boolean; // Support legacy flag
  pixelId?: string;
  conversionEvent?: string;
  customConversionId?: string;
  targetingTerms?: string[];
  resolvedInterests?: Array<{ id: string; name: string; audience_size?: number }>;
  targetingBroad?: boolean;
  pixel?: {
    pixel_id?: string;
    custom_conversion_id?: string;
  };
  saveAsDraft?: boolean;
}

export const handler: Handler = async (event) => {
  console.log("[meta-create-campaign] Request received");

  // Handle OPTIONS for CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }

  try {
    // Get user from Supabase auth header
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[meta-create-campaign] Missing or invalid authorization header");
      return jsonResponse(401, { error: "UNAUTHORIZED" });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Verify the JWT and get the user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[meta-create-campaign] Auth verification failed", authError);
      return jsonResponse(401, { error: "INVALID_TOKEN" });
    }

    console.log("[meta-create-campaign] User verified", {
      userId: user.id.substring(0, 8) + "...",
    });

    // Parse request body
    const body: RequestBody = JSON.parse(event.body || "{}");
    const {
      campaignName,
      adAccountId,
      pageId,
      instagramId: requestInstagramId, // Accept Instagram ID from request body
      dailyBudget,
      linkUrl,
      headline,
      primaryText,
      description,
      targetingCountries,
      creatives,
      placementMode,
      placement,
      pixelId: requestPixelId,
      conversionEvent,
      customConversionId: requestCustomConversionId,
      targetingTerms,
      resolvedInterests,
      targetingBroad,
      pixel,
      saveAsDraft,
    } = body;

    // Parse placement choice (explicit Instagram inclusion from UI)
    // Support multiple formats: placements.includeInstagram, includeInstagram, no_instagram
    const explicitIncludeInstagram =
      body?.placements?.includeInstagram ??
      body?.includeInstagram ??
      (body?.no_instagram === true ? false : undefined);

    // Build placement choice - explicit control from UI
    const placementChoice: PlacementChoice = {
      includeInstagram: explicitIncludeInstagram === true, // must be explicitly true
      includeFacebook: true, // always include Facebook
    };

    console.log("[meta-create-campaign] Placement choice from UI:", placementChoice);

    // Parse pixel configuration (prioritize top-level fields from request)
    const pixelConfig = pixel || {};
    const pixelId: string | undefined = requestPixelId || pixelConfig.pixel_id;
    const customConversionId: string | undefined = requestCustomConversionId || pixelConfig.custom_conversion_id;

    // Validation with detailed error messages
    if (!campaignName || !campaignName.trim()) {
      return jsonResponse(400, {
        error: "MISSING_CAMPAIGN_NAME",
        message: "Please enter a campaign name",
      });
    }

    if (!adAccountId) {
      return jsonResponse(400, {
        error: "MISSING_AD_ACCOUNT",
        message: "Please select an ad account",
      });
    }

    if (!pageId) {
      return jsonResponse(400, {
        error: "MISSING_PAGE",
        message: "Please select a Facebook Page",
      });
    }

    if (!dailyBudget || parseFloat(dailyBudget) <= 0) {
      return jsonResponse(400, {
        error: "INVALID_BUDGET",
        message: "Please enter a valid daily budget (minimum $1)",
      });
    }

    if (!linkUrl || !linkUrl.trim()) {
      return jsonResponse(400, {
        error: "MISSING_LINK",
        message: "Please enter a destination URL for your ad",
      });
    }

    if (!headline || !headline.trim()) {
      return jsonResponse(400, {
        error: "MISSING_HEADLINE",
        message: "Please enter a headline for your ad",
      });
    }

    if (!primaryText || !primaryText.trim()) {
      return jsonResponse(400, {
        error: "MISSING_PRIMARY_TEXT",
        message: "Please enter primary text for your ad",
      });
    }

    if (!creatives || creatives.length === 0) {
      return jsonResponse(400, {
        error: "MISSING_CREATIVE",
        message: "Please add at least one image or video for your ad",
      });
    }

    if (!targetingCountries || targetingCountries.length === 0) {
      return jsonResponse(400, {
        error: "MISSING_TARGETING",
        message: "Please select at least one target country",
      });
    }

    if (!saveAsDraft && !requestPixelId && !pixelId) {
      console.error("[meta-create-campaign] No pixel ID provided");
      return jsonResponse(400, {
        error: "MISSING_PIXEL_ID",
        message: "Please select a Pixel for conversion tracking",
      });
    }

    console.log("[meta-create-campaign] Creating campaign", {
      name: campaignName,
      creativeCount: creatives.length,
      countries: targetingCountries.length,
      draft: saveAsDraft || false,
    });

    // Handle "Save as Draft" - save to database without calling Meta API
    if (saveAsDraft) {
      console.log("[meta-create-campaign] Saving campaign as draft");

      const normalizedAdAccountId = normalizeAdAccountId(adAccountId);
      const draftId = `draft_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Save draft campaign configuration
      const { data: draftCampaign, error: draftError } = await supabase
        .from("meta_ad_campaigns")
        .insert({
          user_id: user.id,
          ad_account_id: `act_${normalizedAdAccountId}`,
          campaign_id: draftId,
          name: campaignName,
          objective: "OUTCOME_TRAFFIC",
          status: "DRAFT",
          effective_status: "DRAFT",
          daily_budget: parseFloat(dailyBudget) * 100 || 0,
          pixel_id: requestPixelId || pixelId || null,
          smart_link_id: null,
          page_id: pageId,
          instagram_id: _ignoredInstagramId || null,
          link_url: linkUrl,
          headline: headline,
          primary_text: primaryText,
          description: description || null,
          targeting_countries: targetingCountries,
          targeting_terms: targetingTerms || [],
          placement_mode: placementMode || 'automatic',
          placement_config: placement || null,
          creatives_config: creatives,
        })
        .select()
        .single();

      if (draftError) {
        console.error("[meta-create-campaign] Failed to save draft", draftError);
        return jsonResponse(500, {
          error: "DRAFT_SAVE_FAILED",
          message: "Failed to save campaign draft",
          details: draftError.message,
        });
      }

      console.log("[meta-create-campaign] Draft saved successfully", { id: draftId });

      // Send notification
      try {
        await supabase.from('notifications').insert({
          user_id: user.id,
          type: 'ad_campaign',
          title: 'Campaign draft saved',
          message: `Your campaign draft "${campaignName}" was saved. You can launch it anytime from the Ads Manager.`,
          entity_type: 'ad_campaign_draft',
          entity_id: draftId,
          read_at: null,
          created_at: new Date().toISOString(),
        });
      } catch (notifErr) {
        console.error('[meta-create-campaign] draft notification error:', notifErr);
      }

      return jsonResponse(200, {
        success: true,
        ok: true,
        mode: 'draft',
        campaign: draftCampaign,
        message: `Campaign draft "${campaignName}" saved successfully`,
      });
    }

    // Get Meta context for user using unified helper (only needed for live campaigns)
    const metaContext = await getMetaContextForUser(user.id, supabase);

    // For live campaigns, we need valid Meta credentials
    if (!metaContext || !metaContext.accessToken) {
      console.log("[meta-create-campaign] No Meta credentials available for launch");

      // Fall back to system credentials if available
      if (SYSTEM_ACCESS_TOKEN) {
        console.log("[meta-create-campaign] Using system credentials as fallback");
      } else {
        return jsonResponse(400, {
          error: "META_CREDS_MISSING",
          message: "No Meta credentials available. Please connect your Meta account in Settings to launch campaigns.",
        });
      }
    } else {
      console.log("[meta-create-campaign] Using user Meta credentials");
    }

    const accessToken = metaContext?.accessToken || SYSTEM_ACCESS_TOKEN || null;

    // 🔥 PERMANENT FIX: Load identity from meta_ad_identity table
    let igActorId: string | null = null;
    let selectedPageId: string = pageId; // Use pageId from request

    if (placementChoice.includeInstagram) {
      console.log("[meta-create-campaign] 🔥 GUARDRAIL: Instagram placement requested, validating identity");

      // STEP 1: Check if pageId was provided
      if (!pageId) {
        console.error("[meta-create-campaign] ❌ BLOCKED: No Facebook Page selected");
        return jsonResponse(400, {
          success: false,
          error: "missing_facebook_page",
          message: "Select a Facebook Page in Ad Identity settings before launching campaigns with Instagram placements.",
        });
      }

      // STEP 2: Load identity from meta_ad_identity table
      console.log("[meta-create-campaign] Loading identity from meta_ad_identity for page:", pageId);

      const { data: identity, error: identityError } = await supabase
        .from("meta_ad_identity")
        .select("page_id, page_name, instagram_actor_id, instagram_username")
        .eq("user_id", user.id)
        .eq("page_id", pageId)
        .maybeSingle();

      if (identityError) {
        console.error("[meta-create-campaign] Error loading identity:", identityError);
      }

      if (!identity) {
        console.error("[meta-create-campaign] ❌ BLOCKED: Page not found in identities");
        return jsonResponse(400, {
          success: false,
          error: "identity_not_found",
          message: "Selected Facebook Page not found. Click 'Refresh Identities' in Ad Identity settings to sync your Pages.",
        });
      }

      // STEP 3: Validate Instagram connection
      if (!identity.instagram_actor_id) {
        console.error("[meta-create-campaign] ❌ BLOCKED: Instagram not connected to Page");
        return jsonResponse(400, {
          success: false,
          error: "missing_instagram_identity",
          message: `Instagram placement selected but no connected Instagram Business Account for Page "${identity.page_name || pageId}". Either connect an Instagram Business Account to this Page or disable Instagram placements.`,
        });
      }

      igActorId = identity.instagram_actor_id;
      console.log("[meta-create-campaign] ✅ GUARDRAIL PASSED:", {
        page: identity.page_name,
        instagram: identity.instagram_username,
        actorId: igActorId.substring(0, 15) + "...",
      });
    } else {
      console.log("[meta-create-campaign] ⚠️ Facebook-only campaign (no Instagram)");
    }

    // Normalize ad account ID (remove 'act_' prefix if present)
    const normalizedAdAccountId = normalizeAdAccountId(adAccountId);

    // Resolve ghostelinkclick custom conversion for CONVERSIONS objective
    let conversionPixelId: string | null = null;
    let customConversionIdResolved: string | null = null;

    try {
      const { customConversion } = await findGhosteLinkClickConversion({
        adAccountId: normalizedAdAccountId,
        accessToken,
      });

      if (customConversion?.id && customConversion?.pixel?.id) {
        customConversionIdResolved = customConversion.id;
        conversionPixelId = customConversion.pixel.id ?? null;
        console.log('[meta-create-campaign] Using ghostelinkclick conversion:', {
          conversionId: customConversionIdResolved,
          pixelId: conversionPixelId,
        });
      }
    } catch (err) {
      console.error('[meta-create-campaign] Failed to resolve ghostelinkclick custom conversion', err);
    }

    // Step 1: Create Campaign with CBO (Campaign Budget Optimization)
    console.log("[meta-create-campaign] Creating campaign with CBO");

    // Parse campaign type (default to traffic for backward compatibility)
    const campaignType = body.campaignType || 'traffic';
    const isSmartLinkCampaign = campaignType === 'smart_link_campaign';

    console.log(`[meta-create-campaign] Campaign type: ${campaignType}`);

    // Determine budget (daily or lifetime)
    let dailyBudgetCents: number | undefined;
    let lifetimeBudgetCents: number | undefined;
    let startTime: string | undefined;
    let endTime: string | undefined;

    if (isSmartLinkCampaign && body.lifetimeBudget) {
      // Smart Link Campaign uses lifetime budget
      lifetimeBudgetCents = Math.round(parseFloat(body.lifetimeBudget) * 100);

      // Set start time to 5 minutes from now
      startTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      // Set end time to 5 years from now (far-future to satisfy Meta requirements)
      endTime = new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString();

      console.log("[meta-create-campaign] Using lifetime budget:", {
        lifetimeBudget: body.lifetimeBudget,
        lifetimeBudgetCents,
        startTime,
        endTime,
      });
    } else {
      // Traditional campaign uses daily budget
      dailyBudgetCents = Math.round(parseFloat(dailyBudget) * 100);
      console.log("[meta-create-campaign] Using daily budget:", dailyBudgetCents);
    }

    // Determine campaign objective
    const campaignObjective = isSmartLinkCampaign ? "OUTCOME_SALES" : "OUTCOME_TRAFFIC";
    console.log(`[meta-create-campaign] Using ${campaignObjective} objective`);

    // Build campaign payload
    const campaignPayload: any = {
      name: campaignName,
      objective: campaignObjective,
      buying_type: "AUCTION",
      status: "PAUSED",
      special_ad_categories: [],
    };

    // Add budget (daily or lifetime)
    if (lifetimeBudgetCents) {
      campaignPayload.lifetime_budget = String(lifetimeBudgetCents);
      // Enable Campaign Budget Optimization for lifetime budgets
      campaignPayload.is_adset_budget_sharing_enabled = "true";
    } else if (dailyBudgetCents) {
      campaignPayload.daily_budget = String(dailyBudgetCents);
      campaignPayload.is_adset_budget_sharing_enabled = "false";
    }

    // For Smart Link Campaign (Sales), enable Advantage+ settings
    if (isSmartLinkCampaign) {
      // Advantage+ Sales Campaign settings
      campaignPayload.is_advantage_campaign = true; // Enable Advantage+
      console.log("[meta-create-campaign] Enabled Advantage+ Sales Campaign");
    }

    let campaignData: any;
    try {
      campaignData = await createMetaCampaign({
        adAccountId: normalizedAdAccountId,
        accessToken,
        payload: campaignPayload,
      });
    } catch (metaError: any) {
      console.error("[meta-create-campaign] Campaign creation failed", metaError);

      const userMessage = metaError?.error?.message || metaError?.message || "Unknown Meta error";

      return jsonResponse(500, {
        success: false,
        error: "Failed to create campaign on Meta",
        message: `Meta API error: ${userMessage}`,
        metaError: metaError,
      });
    }
    const campaignId = campaignData.id;
    console.log("[meta-create-campaign] Campaign created", { campaignId });

    // Build targeting with placements
    let targeting: any = {
      geo_locations: {
        countries: targetingCountries,
      },
      age_min: 16,
      age_max: 40,
    };

    // Add interest targeting
    // Priority 1: Use resolvedInterests if provided (from genre resolver)
    // Priority 2: Use targetingTerms (legacy behavior)
    if (resolvedInterests && resolvedInterests.length > 0) {
      console.log('[meta-create-campaign] Using resolved interests:', resolvedInterests.length);

      // Apply broad targeting constraint (max 3 interests)
      // Or allow up to 5 if broad is disabled
      const maxInterests = targetingBroad !== false ? 3 : 5;
      const interestsToUse = resolvedInterests.slice(0, maxInterests);

      targeting.flexible_spec = [
        {
          interests: interestsToUse.map((i) => ({ id: i.id, name: i.name })),
        },
      ];
      console.log('[meta-create-campaign] Added', interestsToUse.length, 'resolved interests to targeting');
    } else if (targetingTerms && targetingTerms.length > 0) {
      console.log('[meta-create-campaign] Searching for interests:', targetingTerms);
      const { interests } = await searchMetaInterests({
        terms: targetingTerms,
        accessToken,
      });

      if (interests.length > 0) {
        targeting.flexible_spec = [
          {
            interests: interests.map((i) => ({ id: i.id, name: i.name })),
          },
        ];
        console.log('[meta-create-campaign] Added', interests.length, 'interests to targeting');
      } else {
        console.log('[meta-create-campaign] No interests matched, using broad targeting');
      }
    } else {
      console.log('[meta-create-campaign] No targeting terms or resolved interests, using broad targeting');
    }

    // Use explicit placement choice from UI (buildPlacements helper)
    // CRITICAL: If includeInstagram is false, Instagram MUST NOT be included
    let placements = buildPlacements(placementChoice);

    // For Smart Link Campaign, force FB + IG only (disable Advantage+ placements)
    if (isSmartLinkCampaign) {
      placements = {
        publisher_platforms: ['facebook', 'instagram'],
        facebook_positions: ['feed', 'story', 'facebook_reels', 'search'],
        instagram_positions: ['stream', 'story', 'reels', 'explore'],
      };
      console.log("[meta-create-campaign] Smart Link Campaign: forcing FB + IG placements only");
    }

    targeting.publisher_platforms = placements.publisher_platforms;
    targeting.facebook_positions = normalizeFacebookPositions(placements.facebook_positions);

    if (placements.instagram_positions.length > 0) {
      targeting.instagram_positions = normalizeInstagramPositions(placements.instagram_positions);
    }
    // IMPORTANT: Don't set instagram_positions if it's empty (undefined is better than [])

    console.log("[meta-create-campaign] Placements configured:", {
      includeInstagram: placementChoice.includeInstagram,
      platforms: placements.publisher_platforms,
      fbPositions: placements.facebook_positions.length,
      igPositions: placements.instagram_positions.length,
    });

    // Final sanitization: remove Singapore from targeting
    targeting = stripSingaporeFromTargeting(targeting);
    console.log("[meta-create-campaign] Targeting sanitized (Singapore removed if present)", {
      countries: targeting.geo_locations?.countries || [],
    });

    // Add targeting_automation with advantage_audience flag (required by Meta)
    // Set to 0 to disable Advantage Audience (manual targeting control)
    targeting.targeting_automation = {
      advantage_audience: 0,
    };
    console.log("[meta-create-campaign] Added targeting_automation.advantage_audience: 0");

    // Normalize placements to remove deprecated values (video_feeds → facebook_reels)
    const normalizedPlacements = normalizePlacements({
      publisher_platforms: targeting.publisher_platforms,
      facebook_positions: targeting.facebook_positions,
      instagram_positions: targeting.instagram_positions,
      messenger_positions: targeting.messenger_positions,
      audience_network_positions: targeting.audience_network_positions,
    });

    // Apply normalized placements back to targeting
    targeting.publisher_platforms = normalizedPlacements.publisher_platforms;
    targeting.facebook_positions = normalizedPlacements.facebook_positions;
    targeting.instagram_positions = normalizedPlacements.instagram_positions;
    targeting.messenger_positions = normalizedPlacements.messenger_positions;
    targeting.audience_network_positions = normalizedPlacements.audience_network_positions;

    // Step 2: Create Ad Set (no budget, using CBO)
    console.log("[meta-create-campaign] Creating ad set under CBO campaign");

    // Build promoted_object if pixel and conversion event/custom conversion are provided
    let promotedObject: any = undefined;
    let optimizationGoal = "LINK_CLICKS";
    let billingEvent = "IMPRESSIONS";

    // For Smart Link Campaign, always use conversion optimization if pixel is available
    if (isSmartLinkCampaign && pixelId) {
      if (customConversionId) {
        // Custom conversion (prefer SmartLinkOutbound if available)
        promotedObject = {
          pixel_id: pixelId,
          custom_conversion_id: customConversionId,
        };
        optimizationGoal = "OFFSITE_CONVERSIONS";
        console.log("[meta-create-campaign] Smart Link Campaign using custom conversion:", {
          pixelId,
          customConversionId,
        });
      } else if (conversionEvent) {
        // Standard event
        promotedObject = {
          pixel_id: pixelId,
          custom_event_type: conversionEvent,
        };
        optimizationGoal = "OFFSITE_CONVERSIONS";
        console.log("[meta-create-campaign] Smart Link Campaign using standard conversion event:", {
          pixelId,
          conversionEvent,
        });
      } else {
        // Fallback to LINK_CLICKS for Smart Link Campaign if no conversion event
        console.warn("[meta-create-campaign] Smart Link Campaign: No conversion event specified, defaulting to LINK_CLICKS");
      }
    } else if (pixelId && (conversionEvent || customConversionId)) {
      // Regular campaign with conversion tracking
      if (customConversionId) {
        // Custom conversion
        promotedObject = {
          pixel_id: pixelId,
          custom_conversion_id: customConversionId,
        };
        optimizationGoal = "OFFSITE_CONVERSIONS";
        console.log("[meta-create-campaign] Using custom conversion:", {
          pixelId,
          customConversionId,
        });
      } else if (conversionEvent) {
        // Standard event
        promotedObject = {
          pixel_id: pixelId,
          custom_event_type: conversionEvent,
        };
        optimizationGoal = "OFFSITE_CONVERSIONS";
        console.log("[meta-create-campaign] Using standard conversion event:", {
          pixelId,
          conversionEvent,
        });
      }
    } else {
      console.log("[meta-create-campaign] No pixel/event configured, using LINK_CLICKS optimization");
    }

    // Build ad set payload (before bidding strategy applied)
    let adSetPayload: Record<string, any> = {
      access_token: accessToken,
      name: `${campaignName} - Ad Set`,
      campaign_id: campaignId,
      billing_event: billingEvent,
      optimization_goal: optimizationGoal,
      is_adset_budget_sharing_enabled: false,
      status: "PAUSED",
      targeting,
    };

    // Add start_time and end_time for lifetime budget campaigns
    if (startTime && endTime) {
      adSetPayload.start_time = startTime;
      adSetPayload.end_time = endTime;
      console.log("[meta-create-campaign] Added lifetime schedule to ad set:", {
        startTime,
        endTime,
      });
    }

    // Add promoted_object if configured
    if (promotedObject) {
      adSetPayload.promoted_object = promotedObject;
    }

    // 🔥 CRITICAL: Apply explicit bidding strategy with computed bid_amount
    // This computes bid_amount from dailyBudget and sets LOWEST_COST_WITH_BID_CAP
    adSetPayload = applyBiddingStrategy(adSetPayload, dailyBudget);

    // Final enforcement: guarantee nothing overrides these values
    const bidAmount = adSetPayload.bid_amount;
    adSetPayload.bid_strategy = 'LOWEST_COST_WITH_BID_CAP';
    adSetPayload.bid_amount = bidAmount;

    // Log bidding fields for debugging
    logAdsetBiddingFields(adSetPayload, dailyBudget, "ad set before POST");

    console.log("[meta-create-campaign] Ad set payload:", {
      name: adSetPayload.name,
      billing_event: adSetPayload.billing_event,
      optimization_goal: adSetPayload.optimization_goal,
      is_adset_budget_sharing_enabled: adSetPayload.is_adset_budget_sharing_enabled,
      bid_strategy: adSetPayload.bid_strategy, // Should be LOWEST_COST_WITH_BID_CAP
      bid_amount: adSetPayload.bid_amount, // Should be computed value
      targetingKeys: Object.keys(adSetPayload.targeting || {}),
      targeting_automation: adSetPayload.targeting?.targeting_automation,
      has_promoted_object: !!adSetPayload.promoted_object,
      promoted_object: adSetPayload.promoted_object || null,
    });

    // 🔥 DEBUG: Log final adSetPayload
    console.log('[meta-create-campaign] final adsetPayload', JSON.stringify({
      name: adSetPayload.name,
      campaign_id: adSetPayload.campaign_id,
      billing_event: adSetPayload.billing_event,
      optimization_goal: adSetPayload.optimization_goal,
      bid_strategy: adSetPayload.bid_strategy,
      bid_amount: adSetPayload.bid_amount,
      status: adSetPayload.status,
      promoted_object: adSetPayload.promoted_object || null,
      targeting_summary: {
        countries: adSetPayload.targeting?.geo_locations?.countries?.length || 0,
        platforms: adSetPayload.targeting?.publisher_platforms || [],
        advantage_audience: adSetPayload.targeting?.targeting_automation?.advantage_audience,
      },
    }, null, 2));

    let adSetData: any;
    try {
      // Remove access_token from payload (will be added by client)
      const { access_token, ...adSetPayloadClean } = adSetPayload;

      adSetData = await createMetaAdSet({
        adAccountId: normalizedAdAccountId,
        accessToken,
        payload: adSetPayloadClean,
      });
    } catch (metaError: any) {
      console.error("[meta-create-campaign] Ad set creation failed", {
        error: metaError,
      });

      // Log error to debug table with targeting details
      await logDebug({
        supabase,
        userId: user.id,
        step: 'adset_creation',
        payload: {
          ...adSetPayload,
          targeting_details: adSetPayload.targeting,
        },
        response: metaError,
        errorMessage: metaError?.error?.message || metaError?.message,
        metaCampaignId: campaignId,
      });

      const userMessage = metaError?.error?.message || metaError?.message || "Unknown Meta error";

      return jsonResponse(500, {
        success: false,
        error: "Failed to create ad set on Meta",
        message: `Meta API error: ${userMessage}`,
        metaError: metaError,
      });
    }
    const adSetId = adSetData.id;
    console.log("[meta-create-campaign] Ad set created", { adSetId });

    // Step 3: Create Ad Creatives and Ads (one per uploaded creative)
    const createdCreatives: Array<{ index: number; creativeId: string; adId?: string }> = [];
    const createdAds: Array<{ index: number; adId: string }> = [];
    let firstMetaError: any = null;

    for (const creative of creatives) {
      console.log(`[meta-create-campaign] Creating creative ${creative.index}`);

      try {
        // Detect video URL from creative
        const videoUrl: string | undefined =
          creative.videoUrl ||
          creative.video_url ||
          creative.video_file_url ||
          undefined;

        // Detect if this is a video based on file type or URL
        const isVideo = creative.fileType?.startsWith('video/') ||
                        videoUrl ||
                        /\.(mp4|mov|webm|avi)$/i.test(creative.url || '');

        let imageHash: string | undefined = creative.imageHash;
        let videoId: string | null = null;

        if (isVideo && (videoUrl || creative.url)) {
          // VIDEO CREATIVE - upload video
          const actualVideoUrl = videoUrl || creative.url;
          console.log(`[meta-create-campaign] Video detected for creative ${creative.index}:`, actualVideoUrl);

          try {
            videoId = await uploadMetaVideo({
              adAccountId: normalizedAdAccountId,
              accessToken,
              fileUrl: actualVideoUrl,
            });
            console.log(`[meta-create-campaign] Video uploaded successfully: ${videoId}`);

            // Log success
            await logDebug({
              supabase,
              userId: user.id,
              step: 'video_upload',
              payload: { fileUrl: actualVideoUrl },
              response: { video_id: videoId },
              metaCampaignId: campaignId,
            });
          } catch (videoErr: any) {
            console.error(`[meta-create-campaign] Video upload failed for creative ${creative.index}`, videoErr);

            // Log error
            await logDebug({
              supabase,
              userId: user.id,
              step: 'video_upload',
              payload: { fileUrl: actualVideoUrl },
              response: {},
              errorMessage: videoErr.message,
              metaCampaignId: campaignId,
            });

            return jsonResponse(500, {
              success: false,
              error: "Failed to upload video to Meta",
              message: videoErr.message || "Video upload failed",
            });
          }
        } else if (creative.url) {
          // IMAGE CREATIVE - upload image to get hash
          console.log(`[meta-create-campaign] Image detected for creative ${creative.index}:`, creative.url);

          if (!imageHash) {
            // No pre-existing hash, need to upload
            try {
              imageHash = await uploadMetaImage({
                adAccountId: normalizedAdAccountId,
                accessToken,
                fileUrl: creative.url,
              });
              console.log(`[meta-create-campaign] Image uploaded successfully, hash: ${imageHash}`);

              // Log success
              await logDebug({
                supabase,
                userId: user.id,
                step: 'image_upload',
                payload: { fileUrl: creative.url },
                response: { image_hash: imageHash },
                metaCampaignId: campaignId,
              });
            } catch (imageErr: any) {
              console.error(`[meta-create-campaign] Image upload failed for creative ${creative.index}`, imageErr);

              // Log error
              await logDebug({
                supabase,
                userId: user.id,
                step: 'image_upload',
                payload: { fileUrl: creative.url },
                response: {},
                errorMessage: imageErr.message,
                metaCampaignId: campaignId,
              });

              return jsonResponse(500, {
                success: false,
                error: "Failed to upload image to Meta",
                message: imageErr.message || "Image upload failed",
              });
            }
          }
        } else {
          console.error(`[meta-create-campaign] Creative ${creative.index} has no valid URL`);
          return jsonResponse(400, {
            success: false,
            error: "Invalid creative",
            message: `Creative ${creative.index} must have a valid image or video URL`,
          });
        }

        // Build base CTA and message
        const baseCallToAction = {
          type: 'LEARN_MORE',
          value: {
            link: linkUrl,
          },
        };

        const baseMessage = primaryText || headline || campaignName;

        // Build object_story_spec based on video vs image
        const objectStorySpec: any = {
          page_id: selectedPageId,
        };

        // 🔥 PERMANENT GUARDRAIL: Only include instagram_actor_id when explicitly requested AND validated
        if (placementChoice.includeInstagram) {
          // At this point, igActorId is guaranteed to be valid (blocked above if missing)
          if (!igActorId) {
            // This should NEVER happen due to guardrails above, but defensive check
            console.error(`[meta-create-campaign] ❌ FATAL: IG placement on but no actor ID (guardrail bypass detected)`);
            return jsonResponse(500, {
              success: false,
              error: "instagram_actor_validation_failed",
              message: "Instagram validation failed. Please refresh identities and try again.",
            });
          }
          objectStorySpec.instagram_actor_id = igActorId;
          console.log(`[meta-create-campaign] ✅ instagram_actor_id set: ${igActorId.substring(0, 15)}...`);
        } else {
          // IMPORTANT: Do NOT set instagram_actor_id field at all for Facebook-only
          console.log(`[meta-create-campaign] ⚠️ instagram_actor_id NOT set (Facebook-only)`);
        }

        if (videoId) {
          // VIDEO MODE
          console.log(`[meta-create-campaign] Building video creative for ${creative.index}`);

          // Get thumbnail URL - use explicit thumbnail, default from env, or placeholder
          // IMPORTANT: Do NOT use video URLs as thumbnails (Meta requires an image)
          const explicitThumbnail = (creative as any).thumbnailUrl || null;
          const defaultThumbnail = process.env.META_DEFAULT_THUMB_URL || null;
          const placeholderThumbnail = 'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=1200&h=628&fit=crop';

          const thumbnailUrl = explicitThumbnail || defaultThumbnail || placeholderThumbnail;

          console.log(`[meta-create-campaign] Video thumbnail selection:`, {
            explicitThumbnail: !!explicitThumbnail,
            defaultThumbnail: !!defaultThumbnail,
            usingPlaceholder: !explicitThumbnail && !defaultThumbnail,
            finalThumbnail: thumbnailUrl.substring(0, 60) + '...',
          });

          const videoData: any = {
            video_id: videoId,
            title: headline,
            message: baseMessage,
            call_to_action: baseCallToAction,
          };

          // Add thumbnail to video_data (REQUIRED by Meta for video ads)
          videoData.image_url = thumbnailUrl;
          console.log(`[meta-create-campaign] Added thumbnail to video creative: ${thumbnailUrl.substring(0, 80)}`);

          objectStorySpec.video_data = videoData;
        } else {
          // IMAGE MODE (existing behavior)
          console.log(`[meta-create-campaign] Building image creative for ${creative.index}`);
          const linkData: any = {
            link: linkUrl,
            message: baseMessage,
            name: headline,
            call_to_action: baseCallToAction,
          };

          // Add description if provided
          if (description) {
            linkData.description = description;
          }

          // Add image_hash if available
          if (imageHash) {
            linkData.image_hash = imageHash;
            console.log(`[meta-create-campaign] Using image_hash: ${imageHash}`);
          } else {
            console.warn(`[meta-create-campaign] No image_hash provided for creative ${creative.index}; creative may fail`);
          }

          objectStorySpec.link_data = linkData;
        }

        // Build final creative payload
        const creativePayload: any = {
          access_token: accessToken,
          name: `${campaignName} - Creative ${creative.index}`,
          object_story_spec: objectStorySpec,
        };

        // Strip any leftover image_url field (defensive)
        const sanitizedCreativePayload = stripImageUrlFromStorySpec(creativePayload);

        console.log(`[meta-create-campaign] Creative payload for ${creative.index}:`, {
          page_id: selectedPageId,
          instagram_actor_id: igActorId || 'NOT SET (Facebook-only)',
          instagram_requested: placementChoice.includeInstagram,
          has_video: !!videoId,
          has_image_hash: !!imageHash,
          video_thumbnail: videoId ? objectStorySpec.video_data?.image_url : null,
        });

        // Log video creative creation to debug table
        if (videoId) {
          await logDebug({
            supabase,
            userId: user.id,
            step: 'create_video_creative',
            payload: {
              video_id: videoId,
              thumbnail_url: objectStorySpec.video_data?.image_url,
              page_id: pageId,
              instagram_actor_id: igActorId,
            },
            metaCampaignId: campaignId,
            metaAdsetId: adSetId,
          });
        }

        let creativeResData: any;
        try {
          // Remove access_token from payload (will be added by client)
          const { access_token, ...creativePayloadClean } = sanitizedCreativePayload;

          creativeResData = await createMetaAdCreative({
            adAccountId: normalizedAdAccountId,
            accessToken,
            payload: creativePayloadClean,
          });
        } catch (metaError: any) {
          console.error(`[meta-create-campaign] Creative ${creative.index} creation failed`, metaError);

          // Log creative creation error with subcode
          const errorSubcode = metaError?.error?.error_subcode || null;
          const errorUserTitle = metaError?.error?.error_user_title || null;
          const errorUserMsg = metaError?.error?.error_user_msg || null;

          await logDebug({
            supabase,
            userId: user.id,
            step: 'creative_creation_error',
            payload: {
              ...sanitizedCreativePayload.object_story_spec,
              debug_info: {
                page_id: selectedPageId,
                instagram_actor_id: igActorId || null,
                instagram_requested: placementChoice.includeInstagram,
                placements: {
                  publisher_platforms: placements.publisher_platforms,
                  instagram_positions: placements.instagram_positions,
                },
              },
            },
            response: metaError,
            errorMessage: `${errorUserTitle || 'Creative Error'}: ${errorUserMsg || metaError?.error?.message || 'Unknown error'} (subcode: ${errorSubcode || 'none'})`,
            metaCampaignId: campaignId,
            metaAdsetId: adSetId,
          });

          // Capture first error for response
          if (!firstMetaError) {
            firstMetaError = metaError;
          }

          // Return immediately with detailed error
          return jsonResponse(500, {
            success: false,
            error: "Failed to create ad creative",
            message: metaError?.error?.message || metaError?.error?.error_user_msg || "Meta API error while creating creative",
            metaError,
            campaign: { id: campaignId },
            adset: { id: adSetId },
          });
        }
        const creativeId = creativeResData.id;
        console.log(`[meta-create-campaign] Creative ${creative.index} created`, { creativeId });

        createdCreatives.push({
          index: creative.index,
          creativeId,
        });

        // Create Ad
        console.log(`[meta-create-campaign] Creating ad ${creative.index}`);

        const adPayload = {
          name: `${campaignName} - Ad ${creative.index}`,
          adset_id: adSetId,
          creative: { creative_id: creativeId },
          status: "PAUSED",
        };

        console.log(`[meta-create-campaign] Ad payload for ${creative.index}:`, {
          adset_id: adSetId,
          creative_id: creativeId,
          name: adPayload.name,
        });

        let adData: any;
        try {
          adData = await createMetaAd({
            adAccountId: normalizedAdAccountId,
            accessToken,
            payload: adPayload,
          });
        } catch (metaError: any) {
          console.error(`[meta-create-campaign] Ad ${creative.index} creation failed`, metaError);

          // Capture first error for response
          if (!firstMetaError) {
            firstMetaError = metaError;
          }

          // Return immediately with detailed error
          const userMessage = metaError?.error?.message || metaError?.error?.error_user_msg || "Meta API error while creating ad";

          return jsonResponse(500, {
            success: false,
            error: "Failed to create ad",
            message: userMessage,
            metaError,
            campaign: { id: campaignId },
            adset: { id: adSetId },
            creative: { id: creativeId },
          });
        }
        const adId = adData.id;
        console.log(`[meta-create-campaign] Ad ${creative.index} created`, { adId });

        createdAds.push({
          index: creative.index,
          adId,
        });

        // Update the createdCreatives entry with the ad ID
        const creativeEntry = createdCreatives.find((c) => c.index === creative.index);
        if (creativeEntry) {
          creativeEntry.adId = adId;
        }
      } catch (creativeError: any) {
        console.error(`[meta-create-campaign] Error with creative ${creative.index}`, {
          message: creativeError.message,
          stack: creativeError.stack,
        });

        // Return immediately with error
        return jsonResponse(500, {
          success: false,
          error: "Failed to create ad",
          message: creativeError.message || "Unexpected error during ad creation",
          metaError: firstMetaError,
          campaign: { id: campaignId },
          adset: { id: adSetId },
        });
      }
    }

    if (createdAds.length === 0) {
      return jsonResponse(500, {
        success: false,
        error: "Failed to create any ads",
        message: firstMetaError?.error?.message || firstMetaError?.error?.error_user_msg || "No ads were created successfully",
        metaError: firstMetaError,
        campaign: { id: campaignId },
        adset: { id: adSetId },
      });
    }

    console.log("[meta-create-campaign] Campaign creation complete", {
      campaignId,
      adSetId,
      adsCreated: createdAds.length,
    });

    // Save campaign, ad set, and ads to database for tracking
    try {
      // 1. Insert campaign row
      const { error: campaignDbError } = await supabase
        .from("meta_ad_campaigns")
        .insert({
          user_id: user.id,
          ad_account_id: `act_${normalizedAdAccountId}`,
          campaign_id: campaignId,
          name: campaignName,
          objective: campaignObjective,
          status: campaignData.status || "PAUSED",
          daily_budget: parseFloat(dailyBudget) * 100 || 0,
          pixel_id: pixelId || null,
        });

      if (campaignDbError) {
        console.error("[meta-create-campaign] Failed to save campaign to database", campaignDbError);
      } else {
        console.log("[meta-create-campaign] Campaign saved to database");
      }

      // 2. Insert ad set row
      const { error: adsetDbError } = await supabase
        .from("meta_ad_campaigns")
        .insert({
          user_id: user.id,
          ad_account_id: `act_${normalizedAdAccountId}`,
          campaign_id: campaignId,
          adset_id: adSetId,
          name: `${campaignName} - Ad Set`,
          objective: campaignObjective,
          status: adSetData.status || "PAUSED",
          daily_budget: parseFloat(dailyBudget) * 100 || 0,
        });

      if (adsetDbError) {
        console.error("[meta-create-campaign] Failed to save ad set to database", adsetDbError);
      } else {
        console.log("[meta-create-campaign] Ad set saved to database");
      }

      // 3. Insert ad rows
      for (const ad of createdAds) {
        const { error: adDbError } = await supabase
          .from("meta_ad_campaigns")
          .insert({
            user_id: user.id,
            ad_account_id: `act_${normalizedAdAccountId}`,
            campaign_id: campaignId,
            adset_id: adSetId,
            ad_id: ad.adId,
            name: ad.name,
            objective: campaignObjective,
            status: ad.status || "PAUSED",
          });

        if (adDbError) {
          console.error(`[meta-create-campaign] Failed to save ad ${ad.adId} to database`, adDbError);
        } else {
          console.log(`[meta-create-campaign] Ad ${ad.adId} saved to database`);
        }
      }
    } catch (dbSaveError: any) {
      console.error("[meta-create-campaign] Database save error", dbSaveError);
      // Don't throw - Meta campaign was created successfully
    }

    // Save to meta_ad_campaigns table for UI display
    try {
      const campaignRecord = {
        user_id: user.id,
        ad_account_id: `act_${normalizedAdAccountId}`,
        campaign_id: campaignId,
        adset_id: adSetId,
        ad_id: createdAds.length > 0 ? createdAds[0].adId : null,
        name: campaignData.name || campaignName,
        objective: campaignData.objective || campaignObjective,
        status: campaignData.status ?? "PAUSED",
        daily_budget: Math.round(parseFloat(dailyBudget) * 100),
        pixel_id: conversionPixelId || (pixelId ? pixelId : null),
        custom_conversion_id: customConversionIdResolved || (customConversionId ? customConversionId : null),
      };

      const { error: saveError } = await supabase
        .from("meta_ad_campaigns")
        .insert(campaignRecord);

      if (saveError) {
        console.error("[meta-create-campaign] Failed to save meta_ad_campaigns record", saveError);
      } else {
        console.log("[meta-create-campaign] Saved to meta_ad_campaigns table");
      }
    } catch (metaSaveError: any) {
      console.error("[meta-create-campaign] meta_ad_campaigns save error", metaSaveError);
      // Don't throw - Meta campaign was created successfully
    }

    // Send success notification (inlined to keep bundle size small)
    try {
      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'ad_campaign',
        title: 'Ad campaign created',
        message: `Your Meta campaign "${campaignName}" was created successfully with ${createdAds.length} ads.`,
        entity_type: 'ad_campaign',
        entity_id: campaignId,
        read_at: null,
        created_at: new Date().toISOString(),
      });
    } catch (notifErr) {
      console.error('[meta-create-campaign] notification error:', notifErr);
    }

    return jsonResponse(200, {
      success: true,
      ok: true,
      campaign: {
        id: campaignId,
        name: campaignName,
      },
      adset: {
        id: adSetId,
      },
      creatives: createdCreatives,
      ads: createdAds,
      message: `Successfully created campaign with ${createdAds.length} ads`,
    });
  } catch (err: any) {
    console.error("[meta-create-campaign] Fatal error", {
      message: err.message,
      stack: err.stack,
    });
    return jsonResponse(500, {
      error: "INTERNAL_ERROR",
      message: err.message,
    });
  }
};
