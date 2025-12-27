/**
 * Ghoste AI Ad Campaign Helpers
 *
 * Provides Supabase CRUD operations and Meta API wrappers for ad campaign management
 * via the Ghoste AI agent.
 */

import { getSupabaseAdminClient } from './_supabaseAdmin';

const AD_CAMPAIGNS_TABLE = 'meta_ad_campaigns';

export type GhosteAdCampaignRow = {
  id: string;
  user_id: string;
  name: string;
  objective: string | null;
  daily_budget: number | null; // in cents
  status: string | null; // 'ACTIVE' | 'PAUSED' | 'DRAFT'
  ad_account_id: string;
  pixel_id: string | null;
  custom_conversion_id: string | null;
  campaign_id: string | null; // Meta campaign ID
  adset_id: string | null; // Meta ad set ID
  ad_id: string | null; // Meta ad ID
  creative_url: string | null;
  // Extended fields for full draft storage
  link_url?: string | null;
  headline?: string | null;
  primary_text?: string | null;
  description?: string | null;
  page_id?: string | null;
  instagram_id?: string | null;
  smart_link_id?: string | null;
  targeting_countries?: string[] | null;
  targeting_terms?: string[] | null;
  placement_mode?: string | null;
  placement_config?: any | null;
  creatives_config?: any | null;
  created_at?: string;
  updated_at?: string;
};

export type GhosteAdCampaignPlanInput = {
  name: string;
  objective: string;
  daily_budget: number; // in cents
  ad_account_id: string;
  pixel_id: string;
  creative_url?: string;
  custom_conversion_id?: string;
  // Extended fields for complete campaign spec
  link_url?: string;
  headline?: string;
  primary_text?: string;
  description?: string;
  page_id?: string;
  instagram_id?: string;
  smart_link_id?: string;
  targeting_countries?: string[];
  targeting_terms?: string[];
  placement_mode?: 'automatic' | 'manual';
  placement_config?: {
    publisherPlatforms?: string[];
    facebookPositions?: string[];
    instagramPositions?: string[];
  };
  creatives_config?: Array<{
    index: number;
    url: string;
    fileType?: string;
    thumbnailUrl?: string;
  }>;
};

/**
 * List all ad campaigns for a user (campaign rows only, not individual ad sets/ads)
 */
export async function listGhosteAdCampaignsForUser(userId: string): Promise<GhosteAdCampaignRow[]> {
  console.log('[ghosteAds] Listing campaigns for user:', userId);

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.warn('[ghosteAds] Supabase not configured, returning empty campaigns');
    return [];
  }

  const { data, error } = await supabase
    .from(AD_CAMPAIGNS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .is('adset_id', null) // Only get campaign rows (not ad set/ad rows)
    .is('ad_id', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[ghosteAds] list campaigns error', error);
    throw error;
  }

  console.log('[ghosteAds] Found campaigns:', data?.length || 0);
  return data ?? [];
}

/**
 * Get a specific campaign by ID
 */
export async function getGhosteAdCampaignById(
  userId: string,
  id: string
): Promise<GhosteAdCampaignRow | null> {
  console.log('[ghosteAds] Getting campaign:', { userId, id });

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.warn('[ghosteAds] Supabase not configured, returning null');
    return null;
  }

  const { data, error } = await supabase
    .from(AD_CAMPAIGNS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[ghosteAds] get campaign error', error);
    throw error;
  }

  return data ?? null;
}

/**
 * Create or update a campaign draft (not yet pushed to Meta)
 */
export async function upsertGhosteAdCampaignDraft(
  userId: string,
  plan: GhosteAdCampaignPlanInput,
  existingId?: string
): Promise<GhosteAdCampaignRow> {
  console.log('[ghosteAds] Upserting draft campaign:', { userId, existingId, plan });

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Supabase not configured - cannot save campaign draft');
  }

  const payload: any = {
    user_id: userId,
    name: plan.name,
    objective: plan.objective,
    daily_budget: plan.daily_budget,
    status: 'DRAFT',
    ad_account_id: plan.ad_account_id,
    pixel_id: plan.pixel_id,
    custom_conversion_id: plan.custom_conversion_id ?? null,
    creative_url: plan.creative_url ?? null,
    // Extended fields for complete draft storage
    link_url: plan.link_url ?? null,
    headline: plan.headline ?? null,
    primary_text: plan.primary_text ?? null,
    description: plan.description ?? null,
    page_id: plan.page_id ?? null,
    instagram_id: plan.instagram_id ?? null,
    smart_link_id: plan.smart_link_id ?? null,
    targeting_countries: plan.targeting_countries ?? null,
    targeting_terms: plan.targeting_terms ?? null,
    placement_mode: plan.placement_mode ?? 'automatic',
    placement_config: plan.placement_config ?? null,
    creatives_config: plan.creatives_config ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existingId) {
    payload.id = existingId;
  }

  const { data, error } = await supabase
    .from(AD_CAMPAIGNS_TABLE)
    .upsert(payload, { onConflict: 'id' })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[ghosteAds] upsert draft error', error);
    throw error;
  }

  console.log('[ghosteAds] Draft saved:', data?.id);
  return data!;
}

/**
 * Update campaign name and/or daily budget
 */
export async function updateGhosteAdCampaign(params: {
  userId: string;
  id: string;
  name?: string;
  daily_budget?: number;
}): Promise<GhosteAdCampaignRow> {
  const { userId, id, name, daily_budget } = params;

  console.log('[ghosteAds] Updating campaign:', { userId, id, name, daily_budget });

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Supabase not configured - cannot update campaign');
  }

  const updates: any = {
    updated_at: new Date().toISOString(),
  };

  if (name !== undefined) updates.name = name;
  if (daily_budget !== undefined) updates.daily_budget = daily_budget;

  const { data, error } = await supabase
    .from(AD_CAMPAIGNS_TABLE)
    .update(updates)
    .match({ id, user_id: userId })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[ghosteAds] update campaign error', error);
    throw error;
  }

  console.log('[ghosteAds] Campaign updated:', data?.id);
  return data!;
}

/**
 * Update campaign status (ACTIVE/PAUSED)
 */
export async function updateGhosteAdCampaignStatus(params: {
  userId: string;
  id: string;
  status: string; // 'ACTIVE' | 'PAUSED'
}): Promise<GhosteAdCampaignRow> {
  const { userId, id, status } = params;

  console.log('[ghosteAds] Updating campaign status:', { userId, id, status });

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Supabase not configured - cannot update campaign status');
  }

  const { data, error } = await supabase
    .from(AD_CAMPAIGNS_TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .match({ id, user_id: userId })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[ghosteAds] update status error', error);
    throw error;
  }

  console.log('[ghosteAds] Campaign status updated:', data?.id, data?.status);
  return data!;
}

/**
 * Update campaign with Meta IDs after creation
 */
export async function updateGhosteAdCampaignMetaIds(params: {
  userId: string;
  id: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  status?: string;
}): Promise<GhosteAdCampaignRow> {
  const { userId, id, campaign_id, adset_id, ad_id, status } = params;

  console.log('[ghosteAds] Updating campaign Meta IDs:', { userId, id, campaign_id, adset_id, ad_id, status });

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('Supabase not configured - cannot update Meta IDs');
  }

  const updates: any = {
    updated_at: new Date().toISOString(),
  };

  if (campaign_id !== undefined) updates.campaign_id = campaign_id;
  if (adset_id !== undefined) updates.adset_id = adset_id;
  if (ad_id !== undefined) updates.ad_id = ad_id;
  if (status !== undefined) updates.status = status;

  const { data, error } = await supabase
    .from(AD_CAMPAIGNS_TABLE)
    .update(updates)
    .match({ id, user_id: userId })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[ghosteAds] update Meta IDs error', error);
    throw error;
  }

  console.log('[ghosteAds] Campaign Meta IDs updated:', data?.id);
  return data!;
}

/**
 * Delete a campaign draft (only if not yet launched to Meta)
 */
export async function deleteGhosteAdCampaignDraft(
  userId: string,
  id: string
): Promise<void> {
  console.log('[ghosteAds] Deleting draft campaign:', { userId, id });

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.warn('[ghosteAds] Supabase not configured, cannot delete draft');
    return;
  }

  // Only allow deletion if status is 'DRAFT' (not launched to Meta yet)
  const { error } = await supabase
    .from(AD_CAMPAIGNS_TABLE)
    .delete()
    .match({ id, user_id: userId, status: 'DRAFT' });

  if (error) {
    console.error('[ghosteAds] delete draft error', error);
    throw error;
  }

  console.log('[ghosteAds] Draft deleted:', id);
}

/**
 * Helper to call Netlify functions from within ghosteAgent
 */
export async function callNetlifyFunction(path: string, body: any): Promise<any> {
  const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';
  const url = `${baseUrl}/.netlify/functions/${path}`;

  console.log('[ghosteAds] Calling Netlify function:', path, body);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error('[ghosteAds] Netlify function error:', {
      path,
      status: res.status,
      body: json,
    });
    throw new Error(json?.error || `Netlify function ${path} failed with status ${res.status}`);
  }

  console.log('[ghosteAds] Netlify function success:', path);
  return json;
}

/**
 * Create a campaign via Meta API (calls existing meta-create-campaign function)
 */
export async function createMetaCampaignForUser(params: {
  userId: string;
  plan: GhosteAdCampaignPlanInput;
  draftId: string;
}): Promise<GhosteAdCampaignRow> {
  const { userId, plan, draftId } = params;

  console.log('[ghosteAds] Creating Meta campaign:', { userId, draftId, plan });

  // Call existing meta-create-campaign function with full campaign spec
  const result = await callNetlifyFunction('meta-create-campaign', {
    userId,
    campaignName: plan.name,
    adAccountId: plan.ad_account_id,
    pageId: plan.page_id || '',
    instagramId: plan.instagram_id || null,
    dailyBudget: String((plan.daily_budget / 100).toFixed(2)), // Convert cents to dollars
    linkUrl: plan.link_url || '',
    headline: plan.headline || plan.name,
    primaryText: plan.primary_text || `Check out ${plan.name}`,
    description: plan.description || '',
    targetingCountries: plan.targeting_countries || ['US'],
    creatives: plan.creatives_config || [],
    placementMode: plan.placement_mode || 'automatic',
    placement: plan.placement_config || undefined,
    pixelId: plan.pixel_id,
    conversionEvent: 'LINK_CLICK',
    targetingTerms: plan.targeting_terms || [],
    pixel: {
      pixel_id: plan.pixel_id,
      custom_conversion_id: plan.custom_conversion_id || undefined,
    },
    saveAsDraft: false, // We're launching, not drafting
  });

  console.log('[ghosteAds] Meta campaign created:', result);

  // Update the draft with Meta IDs
  const updated = await updateGhosteAdCampaignMetaIds({
    userId,
    id: draftId,
    campaign_id: result.campaign_id,
    adset_id: result.adset_id,
    ad_id: result.ad_id,
    status: 'ACTIVE',
  });

  return updated;
}

/**
 * Update a campaign via Meta API (calls existing meta-manage-campaigns function)
 */
export async function updateMetaCampaignForUser(params: {
  userId: string;
  id: string;
  name?: string;
  daily_budget?: number;
}): Promise<GhosteAdCampaignRow> {
  const { userId, id, name, daily_budget } = params;

  console.log('[ghosteAds] Updating Meta campaign:', { userId, id, name, daily_budget });

  // Get campaign to find Meta campaign_id
  const campaign = await getGhosteAdCampaignById(userId, id);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // If campaign has Meta ID, update via Meta API
  if (campaign.campaign_id) {
    await callNetlifyFunction('meta-manage-campaigns', {
      userId,
      action: 'update',
      campaignId: campaign.campaign_id,
      name,
      dailyBudget: daily_budget,
    });
  }

  // Update in Supabase
  const updated = await updateGhosteAdCampaign({ userId, id, name, daily_budget });

  return updated;
}

/**
 * Toggle campaign status via Meta API (calls existing meta-manage-campaigns function)
 */
export async function toggleMetaCampaignForUser(params: {
  userId: string;
  id: string;
  status: 'ACTIVE' | 'PAUSED';
}): Promise<GhosteAdCampaignRow> {
  const { userId, id, status } = params;

  console.log('[ghosteAds] Toggling Meta campaign:', { userId, id, status });

  // Get campaign to find Meta campaign_id
  const campaign = await getGhosteAdCampaignById(userId, id);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // If campaign has Meta ID, toggle via Meta API
  if (campaign.campaign_id) {
    await callNetlifyFunction('meta-manage-campaigns', {
      userId,
      action: 'toggle',
      campaignId: campaign.campaign_id,
      active: status === 'ACTIVE',
    });
  }

  // Update in Supabase
  const updated = await updateGhosteAdCampaignStatus({ userId, id, status });

  return updated;
}

/**
 * Duplicate a campaign (creates draft copy, optionally launches to Meta)
 */
export async function duplicateGhosteAdCampaign(params: {
  userId: string;
  id: string;
  launchToMeta: boolean;
}): Promise<GhosteAdCampaignRow> {
  const { userId, id, launchToMeta } = params;

  console.log('[ghosteAds] Duplicating campaign:', { userId, id, launchToMeta });

  // Get original campaign
  const original = await getGhosteAdCampaignById(userId, id);
  if (!original) {
    throw new Error('Campaign not found');
  }

  // Create draft copy
  const plan: GhosteAdCampaignPlanInput = {
    name: `${original.name} (Copy)`,
    objective: original.objective || 'LINK_CLICKS',
    daily_budget: original.daily_budget || 1000,
    ad_account_id: original.ad_account_id,
    pixel_id: original.pixel_id || '',
    creative_url: original.creative_url || undefined,
    custom_conversion_id: original.custom_conversion_id || undefined,
  };

  const draft = await upsertGhosteAdCampaignDraft(userId, plan);

  // Optionally launch to Meta
  if (launchToMeta && original.campaign_id) {
    return await createMetaCampaignForUser({ userId, plan, draftId: draft.id });
  }

  return draft;
}
