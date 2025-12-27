/**
 * Ad Launch Truth Check
 *
 * Single source of truth for whether user can launch Meta ads.
 * Eliminates false negatives by checking the SAME sources used by Ads Manager UI.
 *
 * CRITICAL: No stale data, no wrong tables, no duplicated logic.
 */

import { getSupabaseAdmin } from './_supabaseAdmin';

export interface AdLaunchReadiness {
  ready: boolean;

  // Connection status
  meta_connected: boolean;
  meta_ad_account: boolean;
  meta_page: boolean;
  meta_pixel: boolean;

  // Campaign inputs
  has_campaign_input: boolean;
  campaign_input_type?: 'smart_link' | 'one_click' | 'follower_goal' | 'fan_capture';
  campaign_input_id?: string;

  // Blocker (ONLY ONE if not ready)
  blocker?: string;
  blocker_detail?: string;

  // Next action (ONLY ONE if not ready)
  next_action?: string;

  // Assets (for ad creation)
  assets?: {
    ad_account_id: string;
    ad_account_name?: string;
    page_id: string;
    page_name?: string;
    pixel_id?: string;
    pixel_name?: string;
    instagram_id?: string;
    instagram_username?: string;
    access_token: string;
  };
}

/**
 * Check if user can launch Meta ads RIGHT NOW
 *
 * Returns complete readiness status with single blocker if not ready.
 */
export async function checkAdLaunchReadiness(userId: string): Promise<AdLaunchReadiness> {
  const supabase = getSupabaseAdmin();

  console.log('[adLaunchTruthCheck] Checking readiness for:', userId);

  // 1. Check Meta connection (primary source: meta_credentials)
  const { data: metaCreds, error: credsError } = await supabase
    .from('meta_credentials')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (credsError) {
    console.error('[adLaunchTruthCheck] DB error:', credsError);
    return {
      ready: false,
      meta_connected: false,
      meta_ad_account: false,
      meta_page: false,
      meta_pixel: false,
      has_campaign_input: false,
      blocker: 'database_error',
      next_action: 'Try again',
    };
  }

  // Check Meta connection exists
  if (!metaCreds || !metaCreds.access_token) {
    console.log('[adLaunchTruthCheck] No Meta connection');
    return {
      ready: false,
      meta_connected: false,
      meta_ad_account: false,
      meta_page: false,
      meta_pixel: false,
      has_campaign_input: false,
      blocker: 'meta_not_connected',
      next_action: 'Connect Meta in Profile',
    };
  }

  // Check Ad Account (REQUIRED)
  if (!metaCreds.ad_account_id) {
    console.log('[adLaunchTruthCheck] No ad account');
    return {
      ready: false,
      meta_connected: true,
      meta_ad_account: false,
      meta_page: false,
      meta_pixel: false,
      has_campaign_input: false,
      blocker: 'no_ad_account',
      next_action: 'Select ad account in Profile',
    };
  }

  // Check Page (REQUIRED)
  if (!metaCreds.page_id) {
    console.log('[adLaunchTruthCheck] No page');
    return {
      ready: false,
      meta_connected: true,
      meta_ad_account: true,
      meta_page: false,
      meta_pixel: false,
      has_campaign_input: false,
      blocker: 'no_page',
      next_action: 'Select Facebook page in Profile',
    };
  }

  // Check Pixel (OPTIONAL but recommended)
  const hasPixel = !!metaCreds.pixel_id;
  if (!hasPixel) {
    console.log('[adLaunchTruthCheck] Warning: No pixel connected');
  }

  // 2. Check for campaign inputs (ANY of these qualifies)
  const [smartLinks, oneClickLinks, emailCapture, presaves] = await Promise.all([
    supabase
      .from('smart_links')
      .select('id, title')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('oneclick_links')
      .select('id, title')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('email_capture_links')
      .select('id, title')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('presave_links')
      .select('id, song_title')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
  ]);

  let hasCampaignInput = false;
  let campaignInputType: 'smart_link' | 'one_click' | 'follower_goal' | 'fan_capture' | undefined;
  let campaignInputId: string | undefined;

  if (smartLinks.data) {
    hasCampaignInput = true;
    campaignInputType = 'smart_link';
    campaignInputId = smartLinks.data.id;
  } else if (oneClickLinks.data) {
    hasCampaignInput = true;
    campaignInputType = 'one_click';
    campaignInputId = oneClickLinks.data.id;
  } else if (emailCapture.data) {
    hasCampaignInput = true;
    campaignInputType = 'fan_capture';
    campaignInputId = emailCapture.data.id;
  } else if (presaves.data) {
    hasCampaignInput = true;
    campaignInputType = 'smart_link';
    campaignInputId = presaves.data.id;
  }

  // If no campaign input, user can still run ads for follower goal
  // But it's better to have a link - we'll return as "not ready" but with a weak blocker
  if (!hasCampaignInput) {
    console.log('[adLaunchTruthCheck] No campaign input (link/goal)');
  }

  // 3. Assemble readiness
  const ready = (
    metaCreds.access_token &&
    metaCreds.ad_account_id &&
    metaCreds.page_id
    // Note: campaign_input is optional - AI can create it
  );

  const result: AdLaunchReadiness = {
    ready,
    meta_connected: true,
    meta_ad_account: true,
    meta_page: true,
    meta_pixel: hasPixel,
    has_campaign_input: hasCampaignInput,
    campaign_input_type: campaignInputType,
    campaign_input_id: campaignInputId,
  };

  if (ready) {
    result.assets = {
      ad_account_id: metaCreds.ad_account_id,
      ad_account_name: metaCreds.ad_account_name || undefined,
      page_id: metaCreds.page_id,
      page_name: metaCreds.page_name || undefined,
      pixel_id: metaCreds.pixel_id || undefined,
      pixel_name: metaCreds.pixel_name || undefined,
      instagram_id: metaCreds.instagram_actor_id || undefined,
      instagram_username: metaCreds.instagram_username || undefined,
      access_token: metaCreds.access_token,
    };
  }

  console.log('[adLaunchTruthCheck] Result:', {
    ready,
    meta_connected: result.meta_connected,
    meta_ad_account: result.meta_ad_account,
    meta_page: result.meta_page,
    meta_pixel: result.meta_pixel,
    has_campaign_input: hasCampaignInput,
  });

  return result;
}

/**
 * Auto-create Smart Link from platform URL (Spotify/Apple/YouTube)
 *
 * If user provides a platform URL, auto-create a Smart Link so ads can launch.
 */
export async function autoCreateSmartLink(params: {
  userId: string;
  platformUrl: string;
  title?: string;
}): Promise<{ id: string; slug: string; title: string }> {
  const { userId, platformUrl, title } = params;
  const supabase = getSupabaseAdmin();

  console.log('[autoCreateSmartLink] Creating:', { userId, platformUrl, title });

  // Detect platform
  let spotify_url: string | null = null;
  let apple_music_url: string | null = null;
  let youtube_url: string | null = null;
  let tidal_url: string | null = null;
  let soundcloud_url: string | null = null;

  const urlLower = platformUrl.toLowerCase();

  if (urlLower.includes('spotify.com') || urlLower.includes('spotify:')) {
    spotify_url = platformUrl;
  } else if (urlLower.includes('apple.com') || urlLower.includes('music.apple')) {
    apple_music_url = platformUrl;
  } else if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    youtube_url = platformUrl;
  } else if (urlLower.includes('tidal.com')) {
    tidal_url = platformUrl;
  } else if (urlLower.includes('soundcloud.com')) {
    soundcloud_url = platformUrl;
  } else {
    // Generic link - create as one-click instead
    const { data: oneClick, error: oneClickError } = await supabase
      .from('oneclick_links')
      .insert([{
        user_id: userId,
        title: title || 'Auto-created Link',
        target_url: platformUrl,
      }])
      .select('id, slug, title')
      .single();

    if (oneClickError) {
      console.error('[autoCreateSmartLink] One-click creation error:', oneClickError);
      throw new Error('Failed to create link');
    }

    console.log('[autoCreateSmartLink] Created one-click:', oneClick.id);
    return oneClick;
  }

  // Create Smart Link
  const smartLinkTitle = title || `Auto-created Smart Link`;

  const { data: smartLink, error: smartLinkError } = await supabase
    .from('smart_links')
    .insert([{
      user_id: userId,
      title: smartLinkTitle,
      spotify_url,
      apple_music_url,
      youtube_url,
      tidal_url,
      soundcloud_url,
      template: 'Modern',
    }])
    .select('id, slug, title')
    .single();

  if (smartLinkError) {
    console.error('[autoCreateSmartLink] Smart link creation error:', smartLinkError);
    throw new Error('Failed to create smart link');
  }

  console.log('[autoCreateSmartLink] Created smart link:', smartLink.id);
  return smartLink;
}

/**
 * Extract platform URL from user message
 *
 * Looks for Spotify, Apple Music, YouTube, etc. URLs in text.
 */
export function extractPlatformUrl(message: string): string | null {
  const urlPatterns = [
    // Spotify
    /https?:\/\/open\.spotify\.com\/[^\s]+/i,
    /spotify:[^\s]+/i,
    // Apple Music
    /https?:\/\/music\.apple\.com\/[^\s]+/i,
    // YouTube
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[^\s]+/i,
    /https?:\/\/youtu\.be\/[^\s]+/i,
    // Tidal
    /https?:\/\/tidal\.com\/[^\s]+/i,
    // SoundCloud
    /https?:\/\/soundcloud\.com\/[^\s]+/i,
  ];

  for (const pattern of urlPatterns) {
    const match = message.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

/**
 * Log successful campaign launch
 *
 * Records that ads were launched so AI can track it internally.
 */
export async function logCampaignLaunch(params: {
  userId: string;
  campaignId: string;
  campaignName: string;
  dailyBudgetCents: number;
  goal: string;
  linkUrl?: string;
  smartLinkId?: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  console.log('[logCampaignLaunch] Logging:', params);

  // Insert into ai_campaign_launches log
  await supabase
    .from('ai_campaign_launches')
    .insert([{
      user_id: params.userId,
      campaign_id: params.campaignId,
      campaign_name: params.campaignName,
      daily_budget_cents: params.dailyBudgetCents,
      goal: params.goal,
      link_url: params.linkUrl || null,
      smart_link_id: params.smartLinkId || null,
      ads_status: 'RUNNING',
      launched_at: new Date().toISOString(),
    }]);

  console.log('[logCampaignLaunch] ✅ Logged:', params.campaignId);
}
