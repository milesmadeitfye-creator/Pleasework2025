import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { callMetaApi, getGraphApiVersion, metaRequest } from "./_metaClient";
import { getUserMetaConfig, MetaConfigError } from "./_metaUserConfig";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
 * Toggle campaign status (ACTIVE/PAUSED)
 * Also toggles all associated ad sets and ads to keep them in sync
 */
async function toggleCampaign({
  supabase,
  userId,
  campaignId,
  active,
  accessToken,
}: {
  supabase: any;
  userId: string;
  campaignId: string;
  active: boolean;
  accessToken: string;
}) {
  const status = active ? 'ACTIVE' : 'PAUSED';

  console.log('[toggleCampaign] Input:', { campaignId, active, userId });
  console.log('[toggleCampaign] Mapped to status:', status);

  // 1. Update campaign in Meta
  const metaResponse = await callMetaApi({
    endpoint: campaignId,
    accessToken,
    method: 'POST',
    payload: { status },
  });

  console.log('[toggleCampaign] Meta API response:', metaResponse);

  // 2. Update campaign in meta_campaigns (PRIMARY SOURCE OF TRUTH)
  const { data: updatedCampaign, error: dbError } = await supabase
    .from('meta_campaigns')
    .update({
      status,
      is_active: active,
      meta_status: metaResponse?.status || status,
      updated_at: new Date().toISOString()
    })
    .eq('meta_campaign_id', campaignId)
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (dbError) {
    console.error('[toggleCampaign] Failed to update meta_campaigns:', dbError);
  }

  // 3. Also update meta_ad_campaigns for backward compatibility (if exists)
  const { error: legacyError } = await supabase
    .from('meta_ad_campaigns')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .is('adset_id', null)
    .is('ad_id', null);

  if (legacyError) {
    console.log('[toggleCampaign] No legacy campaign to update (this is fine)');
  }

  // 4. Find all ad sets associated with this campaign (from legacy table)
  const { data: adsets, error: adsetsError } = await supabase
    .from('meta_ad_campaigns')
    .select('adset_id')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .not('adset_id', 'is', null)
    .is('ad_id', null);

  if (!adsetsError && adsets && adsets.length > 0) {
    console.log('[toggleCampaign] Found', adsets.length, 'ad sets to toggle');

    // 5. Toggle each ad set in Meta
    for (const adset of adsets) {
      if (adset.adset_id) {
        try {
          await callMetaApi({
            endpoint: adset.adset_id,
            accessToken,
            method: 'POST',
            payload: { status },
          });
          console.log('[toggleCampaign] Toggled ad set:', adset.adset_id);
        } catch (error) {
          console.error('[toggleCampaign] Failed to toggle ad set:', adset.adset_id, error);
        }
      }
    }

    // 6. Update all ad sets in legacy table
    await supabase
      .from('meta_ad_campaigns')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .not('adset_id', 'is', null)
      .is('ad_id', null);

    // 7. Find and toggle all ads under this campaign
    const { data: ads, error: adsError } = await supabase
      .from('meta_ad_campaigns')
      .select('ad_id')
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .not('ad_id', 'is', null);

    if (!adsError && ads && ads.length > 0) {
      console.log('[toggleCampaign] Found', ads.length, 'ads to toggle');

      // 8. Toggle each ad in Meta
      for (const ad of ads) {
        if (ad.ad_id) {
          try {
            await callMetaApi({
              endpoint: ad.ad_id,
              accessToken,
              method: 'POST',
              payload: { status },
            });
            console.log('[toggleCampaign] Toggled ad:', ad.ad_id);
          } catch (error) {
            console.error('[toggleCampaign] Failed to toggle ad:', ad.ad_id, error);
          }
        }
      }

      // 9. Update all ads in legacy table
      await supabase
        .from('meta_ad_campaigns')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('campaign_id', campaignId)
        .eq('user_id', userId)
        .not('ad_id', 'is', null);
    }
  }

  console.log('[toggleCampaign] Toggle complete:', {
    campaign_id: campaignId,
    status,
    is_active: active,
  });

  return { success: true, status, is_active: active, campaign: updatedCampaign };
}

/**
 * Toggle ad status (ACTIVE/PAUSED)
 */
async function toggleAd({
  supabase,
  userId,
  adId,
  active,
  accessToken,
}: {
  supabase: any;
  userId: string;
  adId: string;
  active: boolean;
  accessToken: string;
}) {
  const status = active ? 'ACTIVE' : 'PAUSED';

  console.log('[toggleAd] Updating ad status:', { adId, status });

  // Update Meta
  await callMetaApi({
    endpoint: adId,
    accessToken,
    method: 'POST',
    payload: { status },
  });

  // Update Supabase (ad status stored in campaign record)
  const { error: dbError } = await supabase
    .from('meta_ad_campaigns')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('ad_id', adId)
    .eq('user_id', userId);

  if (dbError) {
    console.error('[toggleAd] Failed to update database:', dbError);
  }

  return { success: true, status };
}

/**
 * Update campaign (full fields support)
 */
async function updateCampaign({
  supabase,
  userId,
  campaignId,
  name,
  dailyBudget,
  status,
  objective,
  specialAdCategories,
  accessToken,
}: {
  supabase: any;
  userId: string;
  campaignId: string;
  name?: string;
  dailyBudget?: number;
  status?: string;
  objective?: string;
  specialAdCategories?: string[];
  accessToken: string;
}) {
  console.log('[updateCampaign] Updating campaign:', {
    campaignId,
    name,
    dailyBudget,
    status,
    objective,
    specialAdCategories
  });

  const updatePayload: any = {};
  const dbUpdate: any = { updated_at: new Date().toISOString() };

  // Name
  if (name) {
    updatePayload.name = name;
    dbUpdate.name = name;
  }

  // Daily budget (keep existing cents conversion)
  if (dailyBudget !== undefined) {
    updatePayload.daily_budget = dailyBudget.toString();
    dbUpdate.daily_budget = dailyBudget;
  }

  // Status
  if (status) {
    updatePayload.status = status;
    dbUpdate.status = status;
  }

  // Objective
  if (objective) {
    updatePayload.objective = objective;
    dbUpdate.objective = objective;
  }

  // Special ad categories
  if (specialAdCategories && Array.isArray(specialAdCategories)) {
    updatePayload.special_ad_categories = JSON.stringify(specialAdCategories);
    // Note: special_ad_categories not stored in db, only sent to Meta
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new Error('No fields to update');
  }

  // Update Meta
  await callMetaApi({
    endpoint: campaignId,
    accessToken,
    method: 'POST',
    payload: updatePayload,
  });

  // Update Supabase
  const { data, error: dbError } = await supabase
    .from('meta_ad_campaigns')
    .update(dbUpdate)
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .select()
    .single();

  if (dbError) {
    console.error('[updateCampaign] Failed to update database:', dbError);
  }

  return { success: true, campaign: data };
}

/**
 * Update ad (name and/or status)
 */
async function updateAd({
  supabase,
  userId,
  adId,
  name,
  status,
  accessToken,
}: {
  supabase: any;
  userId: string;
  adId: string;
  name?: string;
  status?: string;
  accessToken: string;
}) {
  console.log('[updateAd] Updating ad:', { adId, name, status });

  const updatePayload: any = {};
  const dbUpdate: any = { updated_at: new Date().toISOString() };

  if (name) {
    updatePayload.name = name;
    dbUpdate.name = name;
  }

  if (status) {
    updatePayload.status = status;
    dbUpdate.status = status;
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new Error('No fields to update');
  }

  // Update Meta
  await callMetaApi({
    endpoint: adId,
    accessToken,
    method: 'POST',
    payload: updatePayload,
  });

  // Update Supabase
  const { data, error: dbError } = await supabase
    .from('meta_ad_campaigns')
    .update(dbUpdate)
    .eq('ad_id', adId)
    .eq('user_id', userId)
    .select()
    .single();

  if (dbError) {
    console.error('[updateAd] Failed to update database:', dbError);
  }

  return { success: true, ad: data };
}

/**
 * Duplicate campaign
 */
async function duplicateCampaign({
  supabase,
  userId,
  campaignId,
  accessToken,
}: {
  supabase: any;
  userId: string;
  campaignId: string;
  accessToken: string;
}) {
  console.log('[duplicateCampaign] Duplicating campaign:', { campaignId });

  // Load source campaign from database
  const { data: sourceCampaign, error: fetchError } = await supabase
    .from('meta_ad_campaigns')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !sourceCampaign) {
    throw new Error('Campaign not found');
  }

  // Fetch campaign details from Meta to get full configuration
  const metaCampaign: any = await metaRequest(`/${campaignId}`, {
    method: 'GET',
    accessToken,
    query: {
      fields: 'name,objective,status,special_ad_categories,buying_type,daily_budget',
    },
  });

  // Create new campaign with duplicated settings
  const newName = `${metaCampaign.name} (Copy)`;
  const createParams: any = {
    name: newName,
    objective: metaCampaign.objective || 'OUTCOME_TRAFFIC',
    status: 'PAUSED', // Start paused
    buying_type: metaCampaign.buying_type || 'AUCTION',
  };

  if (metaCampaign.special_ad_categories) {
    createParams.special_ad_categories = JSON.stringify(metaCampaign.special_ad_categories);
  }

  if (metaCampaign.daily_budget) {
    createParams.daily_budget = metaCampaign.daily_budget;
  }

  const newCampaignData = await callMetaApi({
    endpoint: `act_${sourceCampaign.ad_account_id}/campaigns`,
    accessToken,
    method: 'POST',
    payload: createParams,
  });

  // Insert new campaign record in Supabase
  const { data: newDbCampaign, error: insertError } = await supabase
    .from('meta_ad_campaigns')
    .insert({
      user_id: userId,
      ad_account_id: sourceCampaign.ad_account_id,
      campaign_id: newCampaignData.id,
      name: newName,
      objective: metaCampaign.objective,
      status: 'PAUSED',
      daily_budget: metaCampaign.daily_budget || sourceCampaign.daily_budget,
      pixel_id: sourceCampaign.pixel_id,
      custom_conversion_id: sourceCampaign.custom_conversion_id,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[duplicateCampaign] Failed to insert into database:', insertError);
    throw new Error('Failed to save duplicated campaign');
  }

  return { success: true, campaign: newDbCampaign };
}

/**
 * Duplicate ad
 */
async function duplicateAd({
  supabase,
  userId,
  adId,
  accessToken,
}: {
  supabase: any;
  userId: string;
  adId: string;
  accessToken: string;
}) {
  console.log('[duplicateAd] Duplicating ad:', { adId });

  // Load source ad from database
  const { data: sourceAd, error: fetchError } = await supabase
    .from('meta_ad_campaigns')
    .select('*')
    .eq('ad_id', adId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !sourceAd) {
    throw new Error('Ad not found');
  }

  // Fetch ad details from Meta
  const metaAd: any = await metaRequest(`/${adId}`, {
    method: 'GET',
    accessToken,
    query: {
      fields: 'name,adset_id,creative,status',
    },
  });

  // Create new ad with duplicated settings
  const newName = `${metaAd.name} (Copy)`;
  const createParams: any = {
    name: newName,
    adset_id: metaAd.adset_id,
    status: 'PAUSED',
  };

  // If creative ID is available, reuse it
  if (metaAd.creative?.id) {
    createParams.creative = JSON.stringify({ creative_id: metaAd.creative.id });
  }

  const newAdData = await callMetaApi({
    endpoint: `act_${sourceAd.ad_account_id}/ads`,
    accessToken,
    method: 'POST',
    payload: createParams,
  });

  // Update the campaign record with new ad ID (or insert new row if tracking separately)
  const { data: newDbAd, error: insertError } = await supabase
    .from('meta_ad_campaigns')
    .insert({
      user_id: userId,
      ad_account_id: sourceAd.ad_account_id,
      campaign_id: sourceAd.campaign_id,
      adset_id: sourceAd.adset_id,
      ad_id: newAdData.id,
      name: newName,
      objective: sourceAd.objective,
      status: 'PAUSED',
      daily_budget: sourceAd.daily_budget,
      pixel_id: sourceAd.pixel_id,
      custom_conversion_id: sourceAd.custom_conversion_id,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[duplicateAd] Failed to insert into database:', insertError);
    throw new Error('Failed to save duplicated ad');
  }

  return { success: true, ad: newDbAd };
}

/**
 * Sync campaigns from Meta API to Supabase
 * Fetches latest campaign data for the user's connected ad account
 */
async function syncCampaignsFromMeta({
  supabase,
  userId,
  accessToken,
  adAccountId,
}: {
  supabase: any;
  userId: string;
  accessToken: string;
  adAccountId: string;
}) {
  console.log('[syncCampaignsFromMeta] Starting sync for user:', userId);
  console.log('[syncCampaignsFromMeta] Ad account:', adAccountId);

  if (!adAccountId) {
    console.error('[syncCampaignsFromMeta] Missing ad account ID');
    throw new Error('No Meta ad account configured. Please set META_AD_ACCOUNT_ID environment variable or select an ad account in Settings.');
  }

  console.log('[syncCampaignsFromMeta] Fetching campaigns from Meta API for ad account:', adAccountId);

  const allCampaigns: any[] = [];

  try {
    // Fetch campaigns with pagination
    const fields = [
      'id',
      'name',
      'objective',
      'status',
      'effective_status',
      'daily_budget',
      'insights.time_range({"since":"2024-01-01","until":"2024-12-31"}).fields(spend,impressions,clicks,actions)',
    ].join(',');

    let nextUrl: string | undefined = undefined;
    let data: any = await metaRequest(`/act_${adAccountId}/campaigns`, {
      method: 'GET',
      accessToken,
      query: {
        fields,
        limit: 100,
      },
    });

    // Collect first page
    if (Array.isArray(data.data)) {
      allCampaigns.push(...data.data);
    }

    // Handle pagination
    while (data.paging?.next) {
      const response = await fetch(data.paging.next);
      data = await response.json();

      if (!response.ok || data.error) {
        console.error('[syncCampaignsFromMeta] Meta API error:', data.error);
        throw new Error(data.error?.message || 'Failed to fetch campaigns from Meta');
      }

      if (Array.isArray(data.data)) {
        allCampaigns.push(...data.data);
      }
    }

    console.log('[syncCampaignsFromMeta] Fetched', allCampaigns.length, 'campaigns from Meta');
  } catch (error: any) {
    console.error('[syncCampaignsFromMeta] Error fetching campaigns:', error);
    throw error;
  }

  if (allCampaigns.length === 0) {
    console.log('[syncCampaignsFromMeta] No campaigns found in ad account');
    return { success: true, campaigns: [], synced: 0 };
  }

  // Map Meta campaigns to database schema for meta_campaigns table (PRIMARY)
  const campaignRows = allCampaigns.map((campaign: any) => {
    // Extract insights data if available
    let spend = 0;
    let impressions = 0;
    let clicks = 0;
    let conversions = 0;

    if (campaign.insights?.data?.[0]) {
      const insights = campaign.insights.data[0];
      spend = parseFloat(insights.spend || '0');
      impressions = parseInt(insights.impressions || '0', 10);
      clicks = parseInt(insights.clicks || '0', 10);

      // Count conversions from actions
      if (Array.isArray(insights.actions)) {
        conversions = insights.actions
          .filter((a: any) => a.action_type?.includes('conversion'))
          .reduce((sum: number, a: any) => sum + parseInt(a.value || '0', 10), 0);
      }
    }

    // Determine is_active based on status
    const status = campaign.status || campaign.effective_status || 'UNKNOWN';
    const isActive = ['ACTIVE', 'IN_REVIEW', 'PENDING_REVIEW', 'PROCESSING', 'SCHEDULED'].includes(status.toUpperCase());

    return {
      user_id: userId,
      ad_account_id: adAccountId,
      meta_campaign_id: campaign.id,
      name: campaign.name,
      objective: campaign.objective || null,
      status: status,
      effective_status: campaign.effective_status || null,
      meta_status: campaign.status || null,
      is_active: isActive,
      daily_budget_cents: campaign.daily_budget ? parseInt(campaign.daily_budget, 10) : null,
      spend_today: spend,
      spend_7d: spend,
      impressions_7d: impressions,
      clicks_7d: clicks,
      conversions_7d: conversions,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  console.log('[syncCampaignsFromMeta] Upserting', campaignRows.length, 'campaigns to meta_campaigns table');

  // Upsert to meta_campaigns (PRIMARY SOURCE OF TRUTH)
  try {
    const { error: upsertError } = await supabase
      .from('meta_campaigns')
      .upsert(campaignRows, {
        onConflict: 'user_id,ad_account_id,meta_campaign_id',
        ignoreDuplicates: false
      });

    if (upsertError) {
      console.error('[syncCampaignsFromMeta] Upsert error:', upsertError);
      throw new Error(`Failed to upsert campaigns: ${upsertError.message}`);
    }

    console.log('[syncCampaignsFromMeta] Successfully upserted to meta_campaigns');
  } catch (upsertError: any) {
    console.error('[syncCampaignsFromMeta] Critical upsert error:', upsertError);
    throw new Error(`Database upsert failed: ${upsertError.message}`);
  }

  // Also upsert to legacy table for backward compatibility
  const legacyRows = campaignRows.map(c => ({
    user_id: c.user_id,
    ad_account_id: c.ad_account_id,
    campaign_id: c.meta_campaign_id,
    name: c.name,
    objective: c.objective,
    status: c.status,
    effective_status: c.effective_status,
    daily_budget: c.daily_budget_cents,
    spend: c.spend_today,
    impressions: c.impressions_7d,
    clicks: c.clicks_7d,
    conversions: c.conversions_7d,
    adset_id: null,
    ad_id: null,
  }));

  try {
    await supabase
      .from('meta_ad_campaigns')
      .upsert(legacyRows, {
        onConflict: 'campaign_id',
        ignoreDuplicates: false
      });
    console.log('[syncCampaignsFromMeta] Also synced to legacy meta_ad_campaigns table');
  } catch (legacyError) {
    console.log('[syncCampaignsFromMeta] Legacy sync skipped (table may not exist)');
  }

  // Fetch updated campaigns from meta_campaigns
  const { data: updatedCampaigns, error: selectError } = await supabase
    .from('meta_campaigns')
    .select('*')
    .eq('user_id', userId)
    .order('last_synced_at', { ascending: false });

  if (selectError) {
    console.error('[syncCampaignsFromMeta] Error fetching updated campaigns:', selectError);
  }

  console.log('[syncCampaignsFromMeta] Sync complete. Total campaigns:', updatedCampaigns?.length || 0);

  return {
    success: true,
    campaigns: updatedCampaigns || [],
    synced: campaignRows.length,
  };
}

export const handler: Handler = async (event) => {
  console.log("[meta-manage-campaigns] Request received");

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
      console.error("[meta-manage-campaigns] Missing or invalid authorization header");
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
      console.error("[meta-manage-campaigns] Auth verification failed", authError);
      return jsonResponse(401, { error: "INVALID_TOKEN" });
    }

    // Get Meta configuration for this user
    let metaConfig;
    try {
      metaConfig = await getUserMetaConfig(user.id);
    } catch (err) {
      if (err instanceof MetaConfigError) {
        console.error('[meta-manage-campaigns]', err.code, err.message);
        return jsonResponse(400, {
          error: err.code,
          message: err.message,
        });
      }
      throw err;
    }

    const accessToken = metaConfig.accessToken;

    console.log('[meta-manage-campaigns] Using user Meta config:', {
      hasToken: !!accessToken,
      hasAdAccount: !!metaConfig.adAccountId,
      hasPage: !!metaConfig.pageId,
    });

    // Parse request body
    const body = JSON.parse(event.body || "{}");
    const { action } = body;

    console.log("[meta-manage-campaigns] Action:", action);

    // Route to appropriate handler
    let result;

    switch (action) {
      case 'toggleCampaign':
        result = await toggleCampaign({
          supabase,
          userId: user.id,
          campaignId: body.campaignId,
          active: body.active,
          accessToken,
        });
        break;

      case 'toggleAd':
        result = await toggleAd({
          supabase,
          userId: user.id,
          adId: body.adId,
          active: body.active,
          accessToken,
        });
        break;

      case 'updateCampaign':
        result = await updateCampaign({
          supabase,
          userId: user.id,
          campaignId: body.campaignId,
          name: body.name,
          dailyBudget: body.dailyBudget,
          status: body.status,
          objective: body.objective,
          specialAdCategories: body.specialAdCategories,
          accessToken,
        });
        break;

      case 'updateAd':
        result = await updateAd({
          supabase,
          userId: user.id,
          adId: body.adId,
          name: body.name,
          status: body.status,
          accessToken,
        });
        break;

      case 'duplicateCampaign':
        result = await duplicateCampaign({
          supabase,
          userId: user.id,
          campaignId: body.campaignId,
          accessToken,
        });
        break;

      case 'duplicateAd':
        result = await duplicateAd({
          supabase,
          userId: user.id,
          adId: body.adId,
          accessToken,
        });
        break;

      // NOTE: syncCampaignsFromMeta is not currently used by the frontend Refresh button.
      // Frontend now only reloads from Supabase. Keep this for future background sync work.
      case 'syncCampaignsFromMeta':
        try {
          if (!metaConfig.adAccountId) {
            throw new Error('No ad account ID available in Meta configuration.');
          }
          console.log('[meta-manage-campaigns] syncCampaignsFromMeta - starting for user:', user.id);
          result = await syncCampaignsFromMeta({
            supabase,
            userId: user.id,
            accessToken,
            adAccountId: metaConfig.adAccountId,
          });
          console.log('[meta-manage-campaigns] syncCampaignsFromMeta - completed successfully');
        } catch (syncError: any) {
          console.error('[meta-manage-campaigns] syncCampaignsFromMeta - error:', {
            message: syncError.message,
            stack: syncError.stack,
            error: syncError
          });
          throw syncError;
        }
        break;

      default:
        return jsonResponse(400, {
          success: false,
          error: `Unknown action: ${action}`,
        });
    }

    return jsonResponse(200, result);
  } catch (err: any) {
    console.error("[meta-manage-campaigns] Fatal error:", {
      message: err.message,
      error: err.error,
      stack: err.stack,
    });

    const metaError = err?.error || err;
    const userMessage = metaError?.message || err.message || 'Unknown error';

    return jsonResponse(500, {
      success: false,
      error: "Failed to manage campaign/ad",
      message: userMessage,
      metaError,
    });
  }
};
