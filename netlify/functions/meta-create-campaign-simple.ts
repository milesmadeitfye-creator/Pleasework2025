import type { Handler } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';
import { applyBiddingStrategy, logAdsetBiddingFields } from './_metaBiddingSanitizer';
import { getUserMetaAssets } from './_metaAssetsHelper';

// Support both old and new environment variable names
const META_GRAPH_VERSION =
  process.env.META_GRAPH_VERSION ||
  process.env.META_GRAPH_API_VERSION ||
  'v24.0';

// System-level credentials (fallback if user doesn't have their own)
const SYSTEM_ACCESS_TOKEN =
  process.env.META_USER_ACCESS_TOKEN ||
  process.env.META_ACCESS_TOKEN;
const SYSTEM_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };
}

function normalizeObjective(input?: string): string {
  const key = (input || '').toUpperCase().trim();
  const map: Record<string, string> = {
    TRAFFIC: 'OUTCOME_TRAFFIC',
    CONVERSIONS: 'OUTCOME_SALES',
    AWARENESS: 'OUTCOME_AWARENESS',
    ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
  };
  return map[key] || 'OUTCOME_TRAFFIC';
}

function normalizeDailyBudget(input: number | string | undefined): string {
  if (input == null) return '500';
  const num = typeof input === 'string' ? Number(input) : input;
  if (!Number.isFinite(num) || num <= 0) {
    return '500';
  }
  const value = num < 1000 ? Math.round(num * 100) : Math.round(num);
  return String(value);
}

function clean<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export const handler: Handler = async (event) => {
  console.log('[meta-create-campaign-simple] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[meta-create-campaign-simple] Missing authorization header');
      return jsonResponse(401, { error: 'UNAUTHORIZED' });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseAdmin();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[meta-create-campaign-simple] Auth verification failed', authError);
      return jsonResponse(401, { error: 'INVALID_TOKEN' });
    }

    console.log('[meta-create-campaign-simple] User verified', {
      userId: user.id.substring(0, 8) + '...',
    });

    const body = event.body ? JSON.parse(event.body) : {};
    let {
      adAccountId,
      name,
      objective,
      status,
      specialAdCategories,
      budget,
      dailyBudget,
      countries,
      pageId,
      instagramId,
      videoId,
      imageUrl,
      headline,
      primaryText,
      description,
      destinationUrl,
      callToAction,
    } = body;

    // Get user's selected Meta assets
    const userAssets = await getUserMetaAssets(user.id);

    // Use user's configured assets if not provided in request
    if (!adAccountId && userAssets?.ad_account_id) {
      adAccountId = userAssets.ad_account_id;
      console.log('[meta-create-campaign-simple] Using user-configured ad account:', adAccountId);
    }

    if (!pageId && userAssets?.page_id) {
      pageId = userAssets.page_id;
      console.log('[meta-create-campaign-simple] Using user-configured page:', pageId);
    }

    if (!instagramId && userAssets?.instagram_id) {
      instagramId = userAssets.instagram_id;
      console.log('[meta-create-campaign-simple] Using user-configured Instagram:', instagramId);
    }

    if (!adAccountId || !name) {
      return jsonResponse(400, {
        success: false,
        error: 'Missing required fields',
        details: {
          adAccountId: !!adAccountId,
          name: !!name,
          hint: !adAccountId ? 'Please configure your Meta assets in the wizard or provide adAccountId in the request' : undefined
        },
      });
    }

    // Try to get user-specific credentials, fall back to system credentials
    const { data: connection, error: dbError } = await supabase
      .from('user_user_meta_connections')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (dbError) {
      console.error('[meta-create-campaign-simple] Database error', dbError);
    }

    let accessToken: string | null = connection?.access_token || null;
    let credentialsSource = 'user';

    // Fall back to system credentials if user doesn't have their own
    if (!accessToken && SYSTEM_ACCESS_TOKEN) {
      console.log('[meta-create-campaign-simple] No user credentials, using system credentials');
      accessToken = SYSTEM_ACCESS_TOKEN;
      credentialsSource = 'system';
    }

    if (!accessToken) {
      console.log('[meta-create-campaign-simple] No Meta credentials available');
      return jsonResponse(400, {
        error: 'META_NOT_CONFIGURED',
        message: 'No Meta credentials available. Please set META_USER_ACCESS_TOKEN or connect your Meta account.',
      });
    }

    console.log('[meta-create-campaign-simple] Using credentials:', {
      source: credentialsSource,
      hasToken: !!accessToken,
    });

    const normalizedAdAccountId = adAccountId.startsWith('act_')
      ? adAccountId.substring(4)
      : adAccountId;

    const normalizedObjective = normalizeObjective(objective);
    const campaignName = name || 'Ghoste Simple Campaign';
    const dailyBudgetValue = normalizeDailyBudget(budget || dailyBudget);

    const campaignPayload = clean({
      name: campaignName,
      objective: normalizedObjective,
      status: status || 'PAUSED',
      buying_type: 'AUCTION',
      special_ad_categories: JSON.stringify(specialAdCategories || ['NONE']),
      daily_budget: dailyBudgetValue,
      is_campaign_budget_optimization: 'true',
      access_token: accessToken,
    });

    console.log('[meta-create-campaign-simple] Creating CBO campaign with budget:', dailyBudgetValue);

    const campaignUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${normalizedAdAccountId}/campaigns`;
    const campaignRes = await fetch(campaignUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(campaignPayload as any).toString(),
    });

    if (!campaignRes.ok) {
      const errorText = await campaignRes.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error('[meta-create-campaign-simple] Campaign creation failed', errorData);
      throw errorData;
    }

    const createdCampaign = await campaignRes.json();
    console.log('[meta-create-campaign-simple] Campaign created', {
      campaignId: createdCampaign.id,
    });

    // Save campaign to database for tracking
    try {
      const { error: dbError } = await supabase
        .from('meta_ad_campaigns')
        .insert({
          user_id: userId,
          ad_account_id: `act_${normalizedAdAccountId}`,
          campaign_id: createdCampaign.id,
          name: campaignName,
          objective: normalizedObjective,
          status: createdCampaign.status || 'PAUSED',
          daily_budget: payload.daily_budget ? parseInt(payload.daily_budget) : null,
          pixel_id: payload.pixel_id || null,
          custom_conversion_id: payload.promoted_object?.custom_conversion_id || null,
        });

      if (dbError) {
        console.error('[meta-create-campaign-simple] Failed to save campaign to database', dbError);
        // Don't throw - Meta campaign was created successfully
      } else {
        console.log('[meta-create-campaign-simple] Campaign saved to database');
      }
    } catch (dbSaveError: any) {
      console.error('[meta-create-campaign-simple] Database save error', dbSaveError);
      // Don't throw - Meta campaign was created successfully
    }

    if (!pageId || !destinationUrl) {
      return jsonResponse(200, {
        success: true,
        campaignId: createdCampaign.id,
        campaign: {
          id: createdCampaign.id,
          name: campaignName,
        },
        message: 'Campaign created (no ad set/ad - missing pageId or destinationUrl)',
      });
    }

    const targetCountries: string[] = Array.isArray(countries) && countries.length
      ? countries
      : ['US'];

    const targeting: any = {
      geo_locations: {
        countries: targetCountries,
      },
      // Add targeting_automation with advantage_audience flag (required by Meta)
      // Set to 0 to disable Advantage Audience (manual targeting control)
      targeting_automation: {
        advantage_audience: 0,
      },
    };

    console.log('[meta-create-campaign-simple] Targeting with advantage_audience:', {
      countries: targetCountries,
      targeting_automation: targeting.targeting_automation,
    });

    // Build ad set payload (before bidding strategy applied)
    let adsetPayload = clean({
      name: `${campaignName} - Ad Set`,
      campaign_id: createdCampaign.id,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      targeting: JSON.stringify(targeting),
      is_adset_budget_sharing_enabled: 'false',
      status: status || 'PAUSED',
      access_token: accessToken,
    });

    // 🔥 CRITICAL: Apply explicit bidding strategy with computed bid_amount
    // This computes bid_amount from dailyBudget and sets LOWEST_COST_WITH_BID_CAP
    const budgetForBid = dailyBudget || budget || 1000;
    adsetPayload = applyBiddingStrategy(adsetPayload, budgetForBid);

    // Final enforcement: guarantee nothing overrides these values
    const bidAmount = adsetPayload.bid_amount;
    adsetPayload.bid_strategy = 'LOWEST_COST_WITH_BID_CAP';
    adsetPayload.bid_amount = bidAmount;

    // Log bidding fields for debugging
    logAdsetBiddingFields(adsetPayload, budgetForBid, 'ad set before POST (simple)');

    console.log('[meta-create-campaign-simple] Creating ad set with explicit bidding:', JSON.stringify(adsetPayload, null, 2));

    const adsetUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${normalizedAdAccountId}/adsets`;
    const adsetRes = await fetch(adsetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(adsetPayload as any).toString(),
    });

    if (!adsetRes.ok) {
      const errorText = await adsetRes.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error('[meta-create-campaign-simple] Ad set creation failed', {
        error: errorData,
        targeting: targeting,
        adsetPayload: adsetPayload,
      });
      throw errorData;
    }

    const createdAdset = await adsetRes.json();
    console.log('[meta-create-campaign-simple] Ad set created', {
      adsetId: createdAdset.id,
    });

    if (!videoId && !imageUrl) {
      return jsonResponse(200, {
        success: true,
        campaignId: createdCampaign.id,
        adsetId: createdAdset.id,
        campaign: {
          id: createdCampaign.id,
          name: campaignName,
        },
        adset: {
          id: createdAdset.id,
        },
        message: 'Campaign and ad set created (no ad - missing videoId or imageUrl)',
      });
    }

    const objectStorySpec: any = {
      page_id: pageId,
    };

    if (instagramId) {
      objectStorySpec.instagram_actor_id = instagramId;
    }

    if (videoId) {
      // Get thumbnail URL - use provided imageUrl or default from env
      const thumbnailUrl =
        imageUrl || // Use imageUrl as thumbnail if provided
        process.env.META_DEFAULT_THUMB_URL ||
        'https://via.placeholder.com/1200x628/0080ff/ffffff?text=Video+Ad'; // Fallback placeholder

      console.log('[meta-create-campaign-simple] Adding thumbnail to video creative:', thumbnailUrl);

      objectStorySpec.video_data = clean({
        video_id: videoId,
        title: headline,
        message: primaryText,
        image_url: thumbnailUrl, // Add thumbnail (required by Meta)
        call_to_action: clean({
          type: callToAction || 'LISTEN_NOW',
          value: { link: destinationUrl },
        }),
      });
    } else if (imageUrl) {
      objectStorySpec.link_data = clean({
        link: destinationUrl,
        message: primaryText,
        name: headline,
        description: description,
        call_to_action: clean({
          type: callToAction || 'LISTEN_NOW',
          value: { link: destinationUrl },
        }),
      });
    }

    const creativePayload = {
      object_story_spec: JSON.stringify(objectStorySpec),
      access_token: accessToken,
    };

    console.log('[meta-create-campaign-simple] Creating creative', {
      has_video: !!videoId,
      has_image: !!imageUrl,
      video_thumbnail: videoId ? objectStorySpec.video_data?.image_url : null,
    });

    const creativeUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${normalizedAdAccountId}/adcreatives`;
    const creativeRes = await fetch(creativeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(creativePayload as any).toString(),
    });

    if (!creativeRes.ok) {
      const errorText = await creativeRes.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      // Log detailed error information
      const errorSubcode = errorData?.error?.error_subcode || null;
      const errorUserTitle = errorData?.error?.error_user_title || null;
      const errorUserMsg = errorData?.error?.error_user_msg || null;

      console.error('[meta-create-campaign-simple] Creative creation failed', {
        error: errorData,
        subcode: errorSubcode,
        userTitle: errorUserTitle,
        userMsg: errorUserMsg,
        video_thumbnail: videoId ? objectStorySpec.video_data?.image_url : null,
      });

      throw errorData;
    }

    const createdCreative = await creativeRes.json();
    console.log('[meta-create-campaign-simple] Creative created', {
      creativeId: createdCreative.id,
    });

    const adPayload = clean({
      name: `${campaignName} - Ad`,
      adset_id: createdAdset.id,
      creative: JSON.stringify({ creative_id: createdCreative.id }),
      status: status || 'PAUSED',
      access_token: accessToken,
    });

    console.log('[meta-create-campaign-simple] Creating ad');

    const adUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${normalizedAdAccountId}/ads`;
    const adRes = await fetch(adUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(adPayload as any).toString(),
    });

    if (!adRes.ok) {
      const errorText = await adRes.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error('[meta-create-campaign-simple] Ad creation failed', errorData);
      throw errorData;
    }

    const createdAd = await adRes.json();
    console.log('[meta-create-campaign-simple] Ad created successfully', {
      adId: createdAd.id,
    });

    return jsonResponse(200, {
      success: true,
      campaignId: createdCampaign.id,
      adsetId: createdAdset.id,
      creativeId: createdCreative.id,
      adId: createdAd.id,
      campaign: {
        id: createdCampaign.id,
        name: campaignName,
      },
      adset: {
        id: createdAdset.id,
      },
      ad: {
        id: createdAd.id,
      },
    });
  } catch (err: any) {
    console.error('[meta-create-campaign-simple] Failed', err);

    const fbError = err?.error || err?.message || err;
    const metaMessage =
      fbError?.error_user_msg ||
      fbError?.message ||
      (typeof fbError === 'string' ? fbError : 'Meta campaign create failed');

    return jsonResponse(500, {
      success: false,
      error: 'Meta campaign create failed',
      message: metaMessage,
      details: err,
    });
  }
};

export default handler;
