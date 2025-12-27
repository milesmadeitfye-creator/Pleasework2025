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

// ========== FALLBACK URL ==========
// CRITICAL: Guarantees ads can always run if Meta is connected
export const FALLBACK_AD_DESTINATION_URL = 'https://ghoste.one/s/million-talk';

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
  destinationUrl: string; // ALWAYS set - uses smart link or fallback
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
 * Get user's Meta connection status from meta_credentials
 * Uses service role to bypass RLS
 * CRITICAL: Derives connection status from resolved IDs (not stale boolean flags)
 */
export async function getAIMetaContext(userId: string): Promise<AIMetaContext | null> {
  const supabase = getSupabaseAdmin();

  // Get credentials from meta_credentials (primary source)
  const { data, error } = await supabase
    .from('meta_credentials')
    .select('ad_account_id, ad_account_name, page_id, page_name, pixel_id, pixel_name, instagram_actor_id, instagram_username, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[getAIMetaContext] Error:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  // CRITICAL: Derive connection status from resolved IDs (not a boolean flag)
  // Meta is connected if we have ad_account_id AND page_id AND pixel_id
  const connected = !!(data.ad_account_id && data.page_id && data.pixel_id);

  console.log('[getAIMetaContext] Derived connection from IDs:', {
    connected,
    ad_account_id: data.ad_account_id,
    page_id: data.page_id,
    pixel_id: data.pixel_id,
  });

  return {
    user_id: userId,
    connected,
    ad_account_id: data.ad_account_id || null,
    ad_account_name: data.ad_account_name || null,
    page_id: data.page_id || null,
    page_name: data.page_name || null,
    pixel_id: data.pixel_id || null,
    pixel_name: data.pixel_name || null,
    instagram_id: data.instagram_actor_id || null,
    instagram_username: data.instagram_username || null,
    updated_at: data.updated_at || new Date().toISOString(),
  };
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
  // CRITICAL: metaConnected is derived from resolved IDs (ad_account_id && page_id && pixel_id)
  // See getAIMetaContext() which derives 'connected' from IDs, not from stale boolean flags
  const metaConnected = metaContext?.connected === true;
  const smartLinksCount = smartLinks.length;

  // CRITICAL: Resolve destination URL with fallback guarantee
  // Priority: user's smart link > fallback URL (ALWAYS has a destination)
  const resolvedDestinationUrl =
    smartLinks.find(l => !!l.destination_url)?.destination_url ||
    FALLBACK_AD_DESTINATION_URL;

  // Determine if user can run ads
  // SIMPLIFIED: If Meta is connected, we can ALWAYS run ads (we have fallback URL)
  let canRunAds = false;
  let blocker: string | null = null;

  if (!metaConnected) {
    blocker = 'meta_not_connected';
  } else {
    // Meta is connected AND we always have a destination (fallback)
    canRunAds = true;
    blocker = null;
  }

  return {
    hasMedia,
    latestVideo,
    latestImage,
    metaConnected,
    meta: metaContext,
    smartLinks,
    smartLinksCount,
    destinationUrl: resolvedDestinationUrl,
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
  if (!meta) {
    return `🔴 META NOT CONNECTED
   Guide user to Profile → Connected Accounts
   Say: "Meta isn't connected yet. Want me to open setup?"`;
  }

  // Derive connection from resolved IDs
  const connected = !!(meta.ad_account_id && meta.page_id && meta.pixel_id);

  if (!connected) {
    // Show which fields are missing
    const missing: string[] = [];
    if (!meta.ad_account_id) missing.push('Ad Account');
    if (!meta.page_id) missing.push('Facebook Page');
    if (!meta.pixel_id) missing.push('Pixel');

    return `🔴 META INCOMPLETE - Missing: ${missing.join(', ')}
   Guide user to Profile → Connected Accounts
   Say: "Meta setup incomplete. You need to configure: ${missing.join(', ')}"`;
  }

  return `✅ META CONNECTED
   Ad Account: ${meta.ad_account_name || meta.ad_account_id}
   Page: ${meta.page_name || meta.page_id}
   Pixel: ${meta.pixel_name || meta.pixel_id}
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

  // Meta status (derive from resolved IDs)
  if (ctx.metaConnected) {
    lines.push('✅ Meta: CONNECTED');
    if (ctx.meta) {
      lines.push(`   Ad Account: ${ctx.meta.ad_account_name || ctx.meta.ad_account_id || 'N/A'}`);
      lines.push(`   Page: ${ctx.meta.page_name || ctx.meta.page_id || 'N/A'}`);
      lines.push(`   Pixel: ${ctx.meta.pixel_name || ctx.meta.pixel_id || 'N/A'}`);
    }
  } else {
    lines.push('🔴 Meta: NOT CONNECTED');
    if (ctx.meta) {
      // Show which fields are missing
      const missing: string[] = [];
      if (!ctx.meta.ad_account_id) missing.push('Ad Account');
      if (!ctx.meta.page_id) missing.push('Facebook Page');
      if (!ctx.meta.pixel_id) missing.push('Pixel');
      if (missing.length > 0) {
        lines.push(`   Missing: ${missing.join(', ')}`);
      }
    }
    lines.push('   Say: "Meta isn\'t connected yet. Want me to open setup?"');
  }
  lines.push('');

  // Destination URL (ALWAYS present)
  lines.push(`🔗 Destination URL: ${ctx.destinationUrl}`);
  if (ctx.smartLinksCount > 0) {
    lines.push(`   (Using user's smart link)`);
  } else {
    lines.push(`   (Using fallback - suggest user create smart link for tracking)`);
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
    lines.push('⚠️  Smart Links: NONE (using fallback URL)');
    lines.push('   💡 Suggest: "Create a smart link for better tracking"');
  }
  lines.push('');

  // CAN RUN ADS - THE CRITICAL DECISION
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (ctx.canRunAds) {
    lines.push('✅ CAN RUN ADS: YES');
    lines.push('   Meta is connected and we have a destination URL');
    lines.push('   🚨 If user asks "run ads", DO NOT refuse. Proceed immediately.');
  } else {
    lines.push('❌ CAN RUN ADS: NO');
    lines.push(`   Blocker: ${ctx.blocker}`);
    if (ctx.blocker === 'meta_not_connected') {
      lines.push('   Say: "Meta isn\'t connected yet. Want me to open setup?"');
    }
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}
