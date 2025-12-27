/**
 * AI Canonical Context - Single Source of Truth for Ghoste AI
 *
 * Uses ONLY these canonical views:
 * - ai_media_assets (user's uploaded media)
 * - ai_meta_context (user's Meta connection status)
 *
 * NEVER check multiple tables separately.
 * NEVER contradict these sources.
 */

import { getSupabaseAdmin } from './_supabaseAdmin';

// ========== TYPES ==========

export interface AIMediaAsset {
  id: string;
  kind: 'video' | 'image' | 'audio' | 'document';
  filename: string;
  mime: string;
  size: number;
  usable_url: string | null;
  meta_ready: boolean;
  created_at: string;
}

export interface AIMetaContext {
  user_id: string;
  connected: boolean;
  ad_account_id: string | null;
  ad_account_name: string | null;
  page_id: string | null;
  page_name: string | null;
  pixel_id: string | null;
  pixel_name: string | null;
  instagram_id: string | null;
  instagram_username: string | null;
  updated_at: string;
}

export interface AISmartLink {
  id: string;
  slug: string;
  title: string | null;
  destination_url: string;
  created_at: string;
}

export interface AIRunAdsContext {
  hasMedia: boolean;
  latestVideo: AIMediaAsset | null;
  latestImage: AIMediaAsset | null;
  metaConnected: boolean;
  meta: AIMetaContext | null;
  smartLinks: AISmartLink[];
  smartLinksCount: number;
  canRunAds: boolean;
  blocker: string | null;
}

// ========== FETCHERS (SERVICE ROLE) ==========

/**
 * Get user's uploaded media from ai_media_assets view
 * Uses service role to bypass RLS
 */
export async function getAIMediaAssets(userId: string): Promise<AIMediaAsset[]> {
  const supabase = getSupabaseAdmin();

  // Query the view directly (it filters by auth.uid() but we use service role)
  // So we need to query media_assets with owner_user_id filter instead
  const { data, error } = await supabase
    .from('media_assets')
    .select('id, kind, filename, mime, size, meta_ready, created_at')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[getAIMediaAssets] Error:', error);
    return [];
  }

  // Transform to include usable_url
  return (data || []).map(asset => ({
    ...asset,
    usable_url: asset.meta_ready ? asset.meta_ready_url : asset.public_url,
  }));
}

/**
 * Get user's Meta connection status from ai_meta_context view
 * Uses service role to bypass RLS
 */
export async function getAIMetaContext(userId: string): Promise<AIMetaContext | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('ai_meta_context')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[getAIMetaContext] Error:', error);
    return null;
  }

  return data;
}

/**
 * Get user's smart links
 */
async function getAISmartLinks(userId: string): Promise<AISmartLink[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('smart_links')
    .select('id, slug, title, spotify_url, apple_music_url, youtube_url, created_at')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[getAISmartLinks] Error:', error);
    return [];
  }

  // Transform to include destination_url
  return (data || []).map(link => ({
    id: link.id,
    slug: link.slug,
    title: link.title,
    destination_url: link.spotify_url || link.apple_music_url || link.youtube_url || `https://ghoste.one/s/${link.slug}`,
    created_at: link.created_at,
  }));
}

/**
 * Get complete run ads context
 * Single query approach - no contradictions possible
 */
export async function getAIRunAdsContext(userId: string): Promise<AIRunAdsContext> {
  // Fetch in parallel
  const [media, metaContext, smartLinks] = await Promise.all([
    getAIMediaAssets(userId),
    getAIMetaContext(userId),
    getAISmartLinks(userId),
  ]);

  // Find latest video and image
  const latestVideo = media.find(m => m.kind === 'video') || null;
  const latestImage = media.find(m => m.kind === 'image') || null;

  const hasMedia = media.length > 0;
  const metaConnected = metaContext?.connected === true;
  const smartLinksCount = smartLinks.length;

  // Determine if user can run ads
  let canRunAds = false;
  let blocker: string | null = null;

  if (!metaConnected) {
    blocker = 'meta_not_connected';
  } else if (!hasMedia && smartLinksCount === 0) {
    blocker = 'no_destination_or_media';
  } else {
    canRunAds = true;
  }

  return {
    hasMedia,
    latestVideo,
    latestImage,
    metaConnected,
    meta: metaContext,
    smartLinks,
    smartLinksCount,
    canRunAds,
    blocker,
  };
}

// ========== AI PROMPT FORMATTERS ==========

/**
 * Format media for AI prompt (short version)
 */
export function formatMediaForAI(media: AIMediaAsset[]): string {
  if (media.length === 0) {
    return '📎 NO UPLOADS - User has not uploaded any media yet.';
  }

  const videos = media.filter(m => m.kind === 'video');
  const images = media.filter(m => m.kind === 'image');

  let lines = ['📎 UPLOADED MEDIA'];

  if (videos.length > 0) {
    lines.push(`   Videos: ${videos.length} (latest: ${videos[0].filename})`);
  }

  if (images.length > 0) {
    lines.push(`   Images: ${images.length} (latest: ${images[0].filename})`);
  }

  lines.push('   💡 Use these for ads, social posts, or campaigns');

  return lines.join('\n');
}

/**
 * Format Meta context for AI prompt (short version)
 */
export function formatMetaForAI(meta: AIMetaContext | null): string {
  if (!meta || !meta.connected) {
    return `🔴 META NOT CONNECTED
   Guide user to Profile → Connected Accounts
   Say: "Meta isn't connected yet. Want me to open setup?"`;
  }

  return `✅ META CONNECTED
   Ad Account: ${meta.ad_account_name || 'Default'}
   Page: ${meta.page_name || 'Default'}
   Pixel: ${meta.pixel_name || 'Default'}
   🚨 NEVER say "not connected" - it IS connected`;
}

/**
 * Format complete run ads context for AI prompt
 */
export function formatRunAdsContextForAI(ctx: AIRunAdsContext): string {
  const lines = ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'];
  lines.push('🎯 RUN ADS CONTEXT (CANONICAL)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  // Meta status
  if (ctx.metaConnected) {
    lines.push('✅ Meta: CONNECTED');
    if (ctx.meta?.ad_account_name) {
      lines.push(`   ${ctx.meta.ad_account_name}`);
    }
  } else {
    lines.push('🔴 Meta: NOT CONNECTED');
    lines.push('   Say: "Meta isn\'t connected yet. Want me to open setup?"');
  }
  lines.push('');

  // Media status
  if (ctx.hasMedia) {
    lines.push('✅ Media: UPLOADED');
    if (ctx.latestVideo) {
      lines.push(`   Latest video: ${ctx.latestVideo.filename}`);
    }
    if (ctx.latestImage) {
      lines.push(`   Latest image: ${ctx.latestImage.filename}`);
    }
  } else {
    lines.push('🔴 Media: NONE');
    lines.push('   Say: "Got a video or image for the ad?"');
  }
  lines.push('');

  // Smart Links status
  if (ctx.smartLinksCount > 0) {
    lines.push(`✅ Smart Links: ${ctx.smartLinksCount}`);
    if (ctx.smartLinks[0]) {
      lines.push(`   Latest: ${ctx.smartLinks[0].title || ctx.smartLinks[0].slug}`);
    }
  } else {
    lines.push('🔴 Smart Links: NONE');
    lines.push('   Say: "Drop the song link"');
  }
  lines.push('');

  // Can run ads?
  if (ctx.canRunAds) {
    lines.push('🚀 CAN RUN ADS: YES');
    lines.push('   Proceed with campaign creation');
    lines.push('   Response: "Bet. I got the video. I can launch ads with it. Daily budget: $10 / $20 / $50?"');
  } else {
    lines.push('⛔ CAN RUN ADS: NO');
    lines.push(`   Blocker: ${ctx.blocker}`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}
