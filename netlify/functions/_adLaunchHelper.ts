/**
 * Ad Launch Helper
 *
 * Unified ad launch flow for Ghoste AI.
 * Handles truth check, auto-link creation, and campaign creation.
 */

import { checkAdLaunchReadiness, autoCreateSmartLink, extractPlatformUrl, logCampaignLaunch } from './_adLaunchTruthCheck';
import { callNetlifyFunction } from './_ghosteAdsHelpers';
import { getSupabaseAdmin } from './_supabaseAdmin';

export interface AdLaunchRequest {
  userId: string;
  userMessage: string; // Original message from user
  campaignName?: string;
  dailyBudgetDollars?: number;
  targetCountries?: string[];
  linkUrl?: string; // If user provides explicit link
  goal?: 'traffic' | 'conversions' | 'followers' | 'awareness';
}

export interface AdLaunchResult {
  success: boolean;

  // Success case
  campaign_id?: string;
  campaign_name?: string;
  message?: string;

  // Failure case (fail fast, single blocker)
  blocker?: string;
  next_action?: string;
}

/**
 * Launch ads for user
 *
 * Steps:
 * 1. Truth check (Meta connected, assets selected)
 * 2. Extract/auto-create link if needed
 * 3. Create Meta campaign
 * 4. Log launch
 * 5. Return simple success/failure
 */
export async function launchAds(request: AdLaunchRequest): Promise<AdLaunchResult> {
  const { userId, userMessage, campaignName, dailyBudgetDollars, targetCountries, linkUrl, goal } = request;

  console.log('[launchAds] Starting:', { userId, campaignName });

  // 1. Truth check
  const readiness = await checkAdLaunchReadiness(userId);

  if (!readiness.ready) {
    console.log('[launchAds] Not ready:', readiness.blocker);
    return {
      success: false,
      blocker: readiness.blocker,
      next_action: readiness.next_action,
    };
  }

  // 2. Determine campaign link
  let finalLinkUrl = linkUrl;
  let smartLinkId: string | undefined;

  // If no link provided, try to extract from message
  if (!finalLinkUrl) {
    const extracted = extractPlatformUrl(userMessage);
    if (extracted) {
      console.log('[launchAds] Extracted URL from message:', extracted);

      // Auto-create Smart Link
      try {
        const autoLink = await autoCreateSmartLink({
          userId,
          platformUrl: extracted,
          title: campaignName || 'Auto-created for ads',
        });

        smartLinkId = autoLink.id;
        finalLinkUrl = `https://ghoste.one/s/${autoLink.slug}`;
        console.log('[launchAds] Auto-created link:', autoLink.id);
      } catch (e: any) {
        console.error('[launchAds] Auto-link creation failed:', e.message);
        return {
          success: false,
          blocker: 'link_creation_failed',
          next_action: 'Try creating a Smart Link first',
        };
      }
    }
  }

  // If user has existing link, use it
  if (!finalLinkUrl && readiness.has_campaign_input) {
    const supabase = getSupabaseAdmin();

    if (readiness.campaign_input_type === 'smart_link' && readiness.campaign_input_id) {
      const { data: link } = await supabase
        .from('smart_links')
        .select('slug, id')
        .eq('id', readiness.campaign_input_id)
        .single();

      if (link) {
        finalLinkUrl = `https://ghoste.one/s/${link.slug}`;
        smartLinkId = link.id;
      }
    } else if (readiness.campaign_input_type === 'one_click' && readiness.campaign_input_id) {
      const { data: link } = await supabase
        .from('oneclick_links')
        .select('slug, target_url')
        .eq('id', readiness.campaign_input_id)
        .single();

      if (link) {
        finalLinkUrl = link.slug ? `https://ghoste.one/l/${link.slug}` : link.target_url;
      }
    }
  }

  // If still no link, default to follower goal
  const effectiveGoal = finalLinkUrl ? (goal || 'traffic') : 'followers';
  const effectiveCampaignName = campaignName || `Campaign ${new Date().toISOString().slice(0, 10)}`;
  const effectiveBudget = dailyBudgetDollars || 10; // $10/day default
  const effectiveCountries = targetCountries || ['US'];

  if (!finalLinkUrl) {
    console.log('[launchAds] No link URL - using follower goal');
  }

  // 3. Create Meta campaign
  try {
    console.log('[launchAds] Creating Meta campaign:', {
      campaign: effectiveCampaignName,
      budget: effectiveBudget,
      goal: effectiveGoal,
      link: finalLinkUrl || 'none (follower goal)',
    });

    const result = await callNetlifyFunction('meta-create-campaign-simple', {
      userId,
      campaignName: effectiveCampaignName,
      adAccountId: readiness.assets!.ad_account_id,
      pageId: readiness.assets!.page_id,
      instagramId: readiness.assets!.instagram_id || null,
      dailyBudget: String(effectiveBudget),
      linkUrl: finalLinkUrl || '',
      headline: effectiveCampaignName,
      primaryText: finalLinkUrl ? `Check this out!` : `Follow us for more`,
      description: '',
      targetingCountries: effectiveCountries,
      pixelId: readiness.assets!.pixel_id || null,
      conversionEvent: finalLinkUrl ? 'LINK_CLICK' : 'PAGE_LIKES',
    });

    console.log('[launchAds] Meta campaign created:', result);

    // 4. Log launch
    await logCampaignLaunch({
      userId,
      campaignId: result.campaign_id,
      campaignName: effectiveCampaignName,
      dailyBudgetCents: effectiveBudget * 100,
      goal: effectiveGoal,
      linkUrl: finalLinkUrl,
      smartLinkId,
    });

    console.log('[launchAds] ✅ Success');

    return {
      success: true,
      campaign_id: result.campaign_id,
      campaign_name: effectiveCampaignName,
      message: `Ads launched: $${effectiveBudget}/day`,
    };
  } catch (e: any) {
    console.error('[launchAds] Campaign creation failed:', e.message);

    return {
      success: false,
      blocker: 'campaign_creation_failed',
      next_action: 'Check Meta connection',
    };
  }
}

/**
 * Get fail-fast blocker message
 *
 * Single blocker, single action - no details.
 */
export function getBlockerMessage(blocker: string): string {
  switch (blocker) {
    case 'meta_not_connected':
      return 'Meta not connected';
    case 'no_ad_account':
      return 'Ad account not selected';
    case 'no_page':
      return 'Facebook page not selected';
    case 'link_creation_failed':
      return 'Could not create link';
    case 'campaign_creation_failed':
      return 'Campaign creation failed';
    default:
      return 'Setup incomplete';
  }
}

/**
 * Get next action message
 *
 * Single action - what user should do next.
 */
export function getNextActionMessage(nextAction: string): string {
  switch (nextAction) {
    case 'Connect Meta in Profile':
      return 'Go to Profile → Connect Meta';
    case 'Select ad account in Profile':
      return 'Go to Profile → Select ad account';
    case 'Select Facebook page in Profile':
      return 'Go to Profile → Select Facebook page';
    case 'Try creating a Smart Link first':
      return 'Create a Smart Link in Studio';
    case 'Check Meta connection':
      return 'Check Profile → Meta settings';
    default:
      return 'Complete setup in Profile';
  }
}
