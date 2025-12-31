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
}

interface MetaExecutionResult {
  success: boolean;
  meta_campaign_id?: string;
  meta_adset_id?: string;
  meta_ad_id?: string;
  error?: string;
}

/**
 * Fetch Meta assets for user from server-side storage
 */
async function fetchMetaAssets(user_id: string): Promise<MetaAssets | null> {
  const supabase = getSupabaseAdmin();

  // Try to get connection status via RPC
  try {
    const { data, error } = await supabase.rpc('get_meta_connection_status');

    if (error) {
      console.error('[fetchMetaAssets] RPC error:', error);
      return null;
    }

    if (!data || !data.auth_connected) {
      console.warn('[fetchMetaAssets] Meta not connected');
      return null;
    }

    // Fetch credentials from meta_credentials or user_app_secrets
    const { data: creds, error: credsError } = await supabase
      .from('meta_credentials')
      .select('access_token, ad_account_id, page_id, instagram_actor_id, pixel_id')
      .eq('user_id', user_id)
      .maybeSingle();

    if (credsError || !creds) {
      console.error('[fetchMetaAssets] No credentials found:', credsError);
      return null;
    }

    if (!creds.access_token || !creds.ad_account_id) {
      console.warn('[fetchMetaAssets] Missing required fields');
      return null;
    }

    return {
      access_token: creds.access_token,
      ad_account_id: creds.ad_account_id,
      page_id: creds.page_id || undefined,
      instagram_actor_id: creds.instagram_actor_id || undefined,
      pixel_id: creds.pixel_id || undefined,
    };
  } catch (err: any) {
    console.error('[fetchMetaAssets] Exception:', err.message);
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
 */
async function createMetaCampaign(
  assets: MetaAssets,
  name: string,
  objective: string
): Promise<{ id: string } | null> {
  const url = `https://graph.facebook.com/v19.0/${assets.ad_account_id}/campaigns`;

  const body = {
    name,
    objective,
    status: 'PAUSED',
    special_ad_categories: [],
    access_token: assets.access_token,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      console.error('[createMetaCampaign] Error:', data.error || data);
      return null;
    }

    return { id: data.id };
  } catch (err: any) {
    console.error('[createMetaCampaign] Exception:', err.message);
    return null;
  }
}

/**
 * Create Meta Ad Set
 */
async function createMetaAdSet(
  assets: MetaAssets,
  campaignId: string,
  name: string,
  dailyBudgetCents: number,
  destinationUrl: string
): Promise<{ id: string } | null> {
  const url = `https://graph.facebook.com/v19.0/${assets.ad_account_id}/adsets`;

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
    access_token: assets.access_token,
  };

  // Add pixel if available
  if (assets.pixel_id) {
    body.promoted_object = {
      pixel_id: assets.pixel_id,
      custom_event_type: 'LINK_CLICK',
    };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      console.error('[createMetaAdSet] Error:', data.error || data);
      return null;
    }

    return { id: data.id };
  } catch (err: any) {
    console.error('[createMetaAdSet] Exception:', err.message);
    return null;
  }
}

/**
 * Create Meta Ad Creative and Ad
 */
async function createMetaAd(
  assets: MetaAssets,
  adsetId: string,
  name: string,
  destinationUrl: string,
  creativeUrls: string[]
): Promise<{ id: string } | null> {
  // For now, use a simple link ad format
  // In production, you'd fetch the actual creative from storage and upload to Meta

  const url = `https://graph.facebook.com/v19.0/${assets.ad_account_id}/ads`;

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
    access_token: assets.access_token,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      console.error('[createMetaAd] Error:', data.error || data);
      return null;
    }

    return { id: data.id };
  } catch (err: any) {
    console.error('[createMetaAd] Exception:', err.message);
    return null;
  }
}

/**
 * Execute full Meta campaign creation
 */
export async function executeMetaCampaign(
  input: CreateCampaignInput
): Promise<MetaExecutionResult> {
  console.log('[executeMetaCampaign] Starting for campaign:', input.campaign_id);

  try {
    // Step 1: Fetch Meta assets
    console.log('[executeMetaCampaign] Step 1/4: Fetching Meta assets...');
    const assets = await fetchMetaAssets(input.user_id);
    if (!assets) {
      return {
        success: false,
        error: 'Meta assets not configured. Connect Meta in Profile → Connected Accounts.',
      };
    }

    console.log('[executeMetaCampaign] ✓ Assets loaded for user:', input.user_id);

    // Step 2: Create Campaign
    console.log('[executeMetaCampaign] Step 2/4: Creating Meta campaign...');
    const objective = mapGoalToObjective(input.ad_goal);
    const campaignName = `Ghoste Campaign ${input.campaign_id.slice(0, 8)}`;

    const campaign = await createMetaCampaign(assets, campaignName, objective);
    if (!campaign) {
      return {
        success: false,
        error: 'Failed to create Meta campaign. Check ad account permissions.',
      };
    }

    console.log('[executeMetaCampaign] ✓ Created campaign:', campaign.id);

    // Step 3: Create Ad Set
    console.log('[executeMetaCampaign] Step 3/4: Creating Meta ad set...');
    const adsetName = `${campaignName} AdSet`;
    const adset = await createMetaAdSet(
      assets,
      campaign.id,
      adsetName,
      input.daily_budget_cents,
      input.destination_url
    );

    if (!adset) {
      return {
        success: false,
        error: 'Failed to create Meta ad set. Campaign created but incomplete.',
        meta_campaign_id: campaign.id,
      };
    }

    console.log('[executeMetaCampaign] ✓ Created adset:', adset.id);

    // Step 4: Create Ad
    console.log('[executeMetaCampaign] Step 4/4: Creating Meta ad...');
    const adName = `${campaignName} Ad`;
    const ad = await createMetaAd(
      assets,
      adset.id,
      adName,
      input.destination_url,
      input.creative_urls || []
    );

    if (!ad) {
      return {
        success: false,
        error: 'Failed to create Meta ad. Campaign and ad set created but incomplete.',
        meta_campaign_id: campaign.id,
        meta_adset_id: adset.id,
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
    };
  } catch (err: any) {
    console.error('[executeMetaCampaign] Unexpected error:', err.message);
    return {
      success: false,
      error: `Meta publish failed: ${err.message || 'Unknown error'}`,
    };
  }
}
