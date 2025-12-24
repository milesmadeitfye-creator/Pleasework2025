/**
 * Ghoste AI Ads Context - Artist Research & Discovery
 *
 * Automatically gathers all relevant artist data to suggest smart ad campaigns
 * without asking the user for technical details like ad account IDs and pixel IDs.
 */

import { getSupabaseAdminClient } from './_supabaseAdmin';

const supabase = getSupabaseAdminClient();

// Table names
const USER_PROFILES_TABLE = 'user_profiles';
const USER_META_ASSETS_TABLE = 'user_meta_assets';
const META_AD_ACCOUNTS_TABLE = 'meta_ad_accounts';
const META_CAMPAIGNS_TABLE = 'meta_campaigns';
const MARKETING_LINKS_TABLE = 'marketing_links';
const SPOTIFY_ARTIST_STATS_TABLE = 'spotify_artist_stats';

export type ArtistProfile = {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  plan: string | null;
};

export type ConnectedMetaAssets = {
  meta_user_id: string | null;
  business_id: string | null;
  business_name: string | null;
  page_id: string | null;
  page_name: string | null;
  instagram_id: string | null;
  instagram_username: string | null;
  ad_account_id: string | null;
  ad_account_name: string | null;
  pixel_id: string | null;
  pixel_name: string | null;
};

export type AdAccount = {
  id: string;
  account_id: string;
  name: string | null;
  currency: string | null;
};

export type ArtistSmartLink = {
  id: string;
  type: string;
  title: string;
  slug: string | null;
  settings: any;
  created_at: string;
};

export type StreamingStatsOverview = {
  // Stub for future Songstats/Chartmetric integration
  // Will be populated when we integrate external APIs
  spotify_monthly_listeners?: number | null;
  top_countries?: { country: string; share: number }[];
  top_cities?: { city: string; share: number }[];
  top_platforms?: { platform: string; share: number }[];
  recent_trend?: 'up' | 'flat' | 'down' | null;
  source?: 'spotify_artist_stats' | 'songstats' | 'chartmetric' | null;
};

export type ActiveCampaign = {
  meta_campaign_id: string;
  name: string;
  status: string;
  is_active: boolean;
  objective: string | null;
  daily_budget_cents: number | null;
  spend_7d: number;
  impressions_7d: number;
  clicks_7d: number;
  conversions_7d: number;
  last_synced_at: string;
};

/**
 * Get user profile for ads context
 */
async function getArtistProfileForAds(userId: string): Promise<ArtistProfile | null> {
  console.log('[ghosteAdsCtx] Fetching artist profile for:', userId);

  const { data, error } = await supabase
    .from(USER_PROFILES_TABLE)
    .select('user_id, display_name, bio, avatar_url, plan')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[ghosteAdsCtx] profile error:', error);
    return null;
  }

  console.log('[ghosteAdsCtx] Profile found:', data?.display_name || 'no name');
  return data ?? null;
}

/**
 * Get user's selected Meta assets (from Connect Wizard)
 */
async function getConnectedMetaAssets(userId: string): Promise<ConnectedMetaAssets | null> {
  console.log('[ghosteAdsCtx] Fetching connected Meta assets for:', userId);

  const { data, error } = await supabase
    .from(USER_META_ASSETS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[ghosteAdsCtx] Meta assets error:', error);
    return null;
  }

  // Also load saved settings from meta_credentials (pixel, page, instagram)
  const { data: credentials } = await supabase
    .from('meta_credentials')
    .select('pixel_id, page_id, instagram_actor_id, use_page_for_posting, use_instagram_for_posting')
    .eq('user_id', userId)
    .maybeSingle();

  if (credentials) {
    console.log('[ghosteAdsCtx] Meta credentials found:', {
      pixel_id: credentials.pixel_id,
      page_id: credentials.page_id,
      instagram_actor_id: credentials.instagram_actor_id,
      use_page_for_posting: credentials.use_page_for_posting,
      use_instagram_for_posting: credentials.use_instagram_for_posting,
    });

    // Merge credentials into data, preferring credentials values if present
    if (data) {
      if (credentials.pixel_id) data.pixel_id = credentials.pixel_id;
      if (credentials.page_id) data.page_id = credentials.page_id;
      if (credentials.instagram_actor_id) data.instagram_id = credentials.instagram_actor_id;
    }
  }

  if (data) {
    console.log('[ghosteAdsCtx] Meta assets found:', {
      ad_account: data.ad_account_name || data.ad_account_id,
      pixel: data.pixel_name || data.pixel_id,
      page: data.page_name || data.page_id,
      instagram: data.instagram_username || data.instagram_id,
    });
  } else {
    console.log('[ghosteAdsCtx] No Meta assets connected yet');
  }

  return data ?? null;
}

/**
 * Get all available Meta ad accounts (fallback if no assets selected)
 */
async function getAvailableAdAccounts(userId: string): Promise<AdAccount[]> {
  console.log('[ghosteAdsCtx] Fetching available ad accounts for:', userId);

  const { data, error } = await supabase
    .from(META_AD_ACCOUNTS_TABLE)
    .select('id, account_id, name, currency')
    .eq('user_id', userId);

  if (error) {
    console.error('[ghosteAdsCtx] Ad accounts error:', error);
    return [];
  }

  console.log('[ghosteAdsCtx] Available ad accounts:', data?.length || 0);
  return data ?? [];
}

/**
 * Get all available Meta pixels (synced from Meta API)
 */
export type MetaPixel = {
  meta_pixel_id: string;
  name: string | null;
  ad_account_id: string | null;
  is_available: boolean;
};

async function getAvailablePixels(userId: string): Promise<MetaPixel[]> {
  console.log('[ghosteAdsCtx] Fetching available pixels from meta_pixels table for:', userId);

  const { data, error } = await supabase
    .from('meta_pixels')
    .select('meta_pixel_id, name, ad_account_id, is_available')
    .eq('user_id', userId)
    .eq('is_available', true)
    .order('last_synced_at', { ascending: false });

  if (error) {
    console.error('[ghosteAdsCtx] Pixels error:', error);
    return [];
  }

  console.log('[ghosteAdsCtx] Available pixels:', data?.length || 0);
  return data ?? [];
}

/**
 * Resolve a valid destination URL from a smart link's platform URLs
 */
function resolveSmartLinkUrl(link: any): string {
  if (link.spotify_url) return link.spotify_url;
  if (link.apple_music_url) return link.apple_music_url;
  if (link.youtube_url) return link.youtube_url;
  if (link.youtube_music_url) return link.youtube_music_url;
  if (link.tidal_url) return link.tidal_url;
  if (link.soundcloud_url) return link.soundcloud_url;
  if (link.deezer_url) return link.deezer_url;
  if (link.amazon_music_url) return link.amazon_music_url;
  if (link.slug) return `https://ghoste.one/s/${link.slug}`;
  return '';
}

/**
 * Get key smart links for ads (recent releases, pre-saves, shows)
 */
async function getKeySmartLinksForAds(userId: string): Promise<ArtistSmartLink[]> {
  console.log('[ghosteAdsCtx] Fetching smart links for:', userId);

  const { data, error } = await supabase
    .from('smart_links')
    .select('id, title, slug, spotify_url, apple_music_url, youtube_url, youtube_music_url, tidal_url, soundcloud_url, deezer_url, amazon_music_url, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[ghosteAdsCtx] Smart links error:', error);
    return [];
  }

  console.log('[ghosteAdsCtx] Smart links found:', data?.length || 0);

  // Format with resolved destination URLs
  const formatted = (data || []).map(link => ({
    id: link.id,
    type: 'smart' as const,
    title: link.title || 'Untitled',
    slug: link.slug,
    settings: {
      destination_url: resolveSmartLinkUrl(link),
      spotify_url: link.spotify_url,
      apple_music_url: link.apple_music_url,
    },
    created_at: link.created_at,
  }));

  return formatted;
}

/**
 * Get user's active campaigns
 */
async function getActiveCampaigns(userId: string): Promise<ActiveCampaign[]> {
  console.log('[ghosteAdsCtx] Fetching active campaigns for:', userId);

  const { data, error } = await supabase
    .from(META_CAMPAIGNS_TABLE)
    .select('meta_campaign_id, name, status, is_active, objective, daily_budget_cents, spend_7d, impressions_7d, clicks_7d, conversions_7d, last_synced_at')
    .eq('user_id', userId)
    .order('last_synced_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[ghosteAdsCtx] Campaigns error:', error);
    return [];
  }

  console.log('[ghosteAdsCtx] Campaigns found:', data?.length || 0);
  return data ?? [];
}

/**
 * Get streaming stats overview (stub for future integration)
 *
 * This will be populated when we integrate:
 * - Songstats API
 * - Chartmetric API
 * - Spotify for Artists API
 */
async function getStreamingStatsOverview(userId: string): Promise<StreamingStatsOverview | null> {
  console.log('[ghosteAdsCtx] Fetching streaming stats for:', userId);

  // Try to get Spotify artist stats if available
  const { data: spotifyStats, error } = await supabase
    .from(SPOTIFY_ARTIST_STATS_TABLE)
    .select('monthly_listeners, follower_count, popularity, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[ghosteAdsCtx] Spotify stats error:', error);
  }

  if (spotifyStats) {
    console.log('[ghosteAdsCtx] Spotify stats found:', {
      monthly_listeners: spotifyStats.monthly_listeners,
      followers: spotifyStats.follower_count,
    });

    return {
      spotify_monthly_listeners: spotifyStats.monthly_listeners,
      source: 'spotify_artist_stats',
      // TODO: Add top_countries, top_cities when we integrate Songstats/Chartmetric
      top_countries: null,
      top_cities: null,
      top_platforms: null,
      recent_trend: null,
    };
  }

  console.log('[ghosteAdsCtx] No streaming stats available yet');

  // TODO: Future integration point
  // When we add Songstats/Chartmetric, call netlify function here:
  // const stats = await callNetlifyFunction('get-streaming-stats', { userId });
  // return stats;

  return null;
}

/**
 * Get complete artist ads context
 *
 * This is the main function that gathers everything Ghoste AI needs
 * to suggest smart ad campaigns without asking technical questions.
 */
export async function getArtistAdsContext(userId: string) {
  console.log('[ghosteAdsCtx] ===== Building complete ads context for user:', userId, '=====');

  const [profile, metaAssets, adAccounts, pixels, smartLinks, streaming, campaigns] = await Promise.all([
    getArtistProfileForAds(userId),
    getConnectedMetaAssets(userId),
    getAvailableAdAccounts(userId),
    getAvailablePixels(userId),
    getKeySmartLinksForAds(userId),
    getStreamingStatsOverview(userId),
    getActiveCampaigns(userId),
  ]);

  const context = {
    profile,
    metaAssets,
    adAccounts,
    pixels,
    smartLinks,
    streaming,
    campaigns,
  };

  console.log('[ghosteAdsCtx] ===== Context complete =====');
  console.log('[ghosteAdsCtx] Has profile:', !!profile);
  console.log('[ghosteAdsCtx] Has Meta assets:', !!metaAssets);
  console.log('[ghosteAdsCtx] Ad accounts available:', adAccounts.length);
  console.log('[ghosteAdsCtx] Pixels available:', pixels.length);
  console.log('[ghosteAdsCtx] Smart links:', smartLinks.length);
  console.log('[ghosteAdsCtx] Has streaming stats:', !!streaming);
  console.log('[ghosteAdsCtx] Active campaigns:', campaigns.length);

  return context;
}

/**
 * Helper to format context for AI display
 *
 * Converts raw context into human-readable summary for the AI
 */
export function formatAdsContextForAI(context: Awaited<ReturnType<typeof getArtistAdsContext>>): string {
  const lines: string[] = [];

  lines.push('=== ARTIST CONTEXT ===');

  // Profile
  if (context.profile) {
    lines.push('');
    lines.push('Artist Profile:');
    lines.push(`  Name: ${context.profile.display_name || 'Not set'}`);
    lines.push(`  Plan: ${context.profile.plan || 'free'}`);
    if (context.profile.bio) {
      lines.push(`  Bio: ${context.profile.bio.slice(0, 150)}...`);
    }
  }

  // Meta Assets (selected from wizard)
  if (context.metaAssets) {
    lines.push('');
    lines.push('Connected Meta Assets (READY TO USE):');
    lines.push(`  Ad Account: ${context.metaAssets.ad_account_name || context.metaAssets.ad_account_id || 'Not selected'}`);
    lines.push(`  Pixel: ${context.metaAssets.pixel_name || context.metaAssets.pixel_id || 'Not selected'}`);
    lines.push(`  Facebook Page: ${context.metaAssets.page_name || context.metaAssets.page_id || 'Not selected'}`);
    lines.push(`  Instagram: ${context.metaAssets.instagram_username || context.metaAssets.instagram_id || 'Not selected'}`);
  } else if (context.adAccounts.length > 0) {
    lines.push('');
    lines.push('Available Ad Accounts (user needs to complete Meta setup):');
    context.adAccounts.slice(0, 3).forEach(acc => {
      lines.push(`  - ${acc.name || acc.account_id} (${acc.currency || 'USD'})`);
    });
    if (context.adAccounts.length > 3) {
      lines.push(`  ... and ${context.adAccounts.length - 3} more`);
    }
  } else {
    lines.push('');
    lines.push('Meta Connection: NOT CONNECTED (user needs to connect Meta first)');
  }

  // Available Pixels (synced from Meta API)
  if (context.pixels && context.pixels.length > 0) {
    lines.push('');
    lines.push('Available Meta Pixels (synced from Meta):');
    context.pixels.slice(0, 5).forEach(pixel => {
      lines.push(`  - ${pixel.name || 'Unnamed Pixel'} (ID: ${pixel.meta_pixel_id})`);
    });
    if (context.pixels.length > 5) {
      lines.push(`  ... and ${context.pixels.length - 5} more`);
    }
  }

  // Smart Links
  if (context.smartLinks.length > 0) {
    lines.push('');
    lines.push('Recent Smart Links (potential ad destinations):');
    context.smartLinks.slice(0, 5).forEach(link => {
      lines.push(`  - ${link.type}: "${link.title}" (${link.slug ? `ghoste.one/s/${link.slug}` : 'no slug'})`);
    });
  }

  // Active Campaigns
  if (context.campaigns && context.campaigns.length > 0) {
    lines.push('');
    lines.push('Active Ad Campaigns:');
    const activeCampaigns = context.campaigns.filter(c => c.is_active);
    const pausedCampaigns = context.campaigns.filter(c => !c.is_active);

    if (activeCampaigns.length > 0) {
      lines.push(`  ${activeCampaigns.length} ACTIVE campaigns:`);
      activeCampaigns.slice(0, 5).forEach(campaign => {
        const budget = campaign.daily_budget_cents ? `$${(campaign.daily_budget_cents / 100).toFixed(2)}/day` : 'No budget';
        const spend = `$${campaign.spend_7d.toFixed(2)} spent (7d)`;
        const performance = `${campaign.impressions_7d.toLocaleString()} impressions, ${campaign.clicks_7d} clicks`;
        lines.push(`    - "${campaign.name}" (${campaign.objective || 'traffic'}) - ${budget}, ${spend}, ${performance}`);
      });
    }

    if (pausedCampaigns.length > 0) {
      lines.push(`  ${pausedCampaigns.length} PAUSED campaigns`);
    }
  }

  // Streaming Stats
  if (context.streaming) {
    lines.push('');
    lines.push('Streaming Stats:');
    if (context.streaming.spotify_monthly_listeners) {
      lines.push(`  Spotify Monthly Listeners: ${context.streaming.spotify_monthly_listeners.toLocaleString()}`);
    }
    if (context.streaming.top_countries) {
      lines.push(`  Top Countries: ${context.streaming.top_countries.map(c => c.country).join(', ')}`);
    }
    lines.push(`  Source: ${context.streaming.source || 'unknown'}`);
  }

  lines.push('');
  lines.push('=== END CONTEXT ===');

  return lines.join('\n');
}
