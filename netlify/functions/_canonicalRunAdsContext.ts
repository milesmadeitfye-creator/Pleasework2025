/**
 * Canonical Run Ads Context - Single Source of Truth
 *
 * CRITICAL: This is the ONLY module that determines run-ads readiness.
 * All server-side context reads use SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
 *
 * Meta credentials: meta_credentials table ONLY (no meta_connections, user_meta_assets)
 * Links: smart_links, oneclick_links base tables
 * Media: media_assets table
 */

import { getSupabaseAdmin } from './_supabaseAdmin';

// ========== LINKS: CANONICAL BASE TABLES ==========

export interface LinkAvailability {
  smartLinksCount: number;
  oneClickCount: number;
  publicTrackCount: number;
  preSaveCount: number;
  emailCaptureCount: number;
  totalLinks: number;
  latestSmartLink?: {
    id: string;
    slug: string;
    destination_url: string;
    title: string | null;
    created_at: string;
  };
  latestOneClick?: {
    id: string;
    slug: string;
    destination_url: string;
    title: string | null;
    created_at: string;
  };
  latestPublicTrack?: {
    id: string;
    destination_url: string;
    title: string | null;
    created_at: string;
  };
}

/**
 * Get link availability from canonical base tables ONLY
 * Uses service role to bypass RLS
 */
export async function getLinkAvailability(userId: string): Promise<LinkAvailability> {
  const supabase = getSupabaseAdmin();

  console.log('[getLinkAvailability] Fetching for user:', userId);

  // Query base tables in parallel (service role bypasses RLS)
  const [smartLinksResult, oneClickResult, publicTrackResult, preSaveResult, emailCaptureResult] = await Promise.allSettled([
    // smart_links: filter by owner_user_id
    supabase
      .from('smart_links')
      .select('id, slug, title, spotify_url, apple_music_url, youtube_url, created_at')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1),

    // oneclick_links: filter by owner_user_id
    supabase
      .from('oneclick_links')
      .select('id, slug, title, target_url, created_at')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1),

    // public_track_links: filter by user_id
    supabase
      .from('public_track_links')
      .select('id, title, destination_url, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1),

    // presave_links: filter by user_id
    supabase
      .from('presave_links')
      .select('id, slug, song_title, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1),

    // email_capture_links: filter by user_id
    supabase
      .from('email_capture_links')
      .select('id, slug, title, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  // Count smart links
  const smartLinksCount = smartLinksResult.status === 'fulfilled' && smartLinksResult.value.data
    ? await countSmartLinks(userId)
    : 0;

  // Count one-click links
  const oneClickCount = oneClickResult.status === 'fulfilled' && oneClickResult.value.data
    ? await countOneClickLinks(userId)
    : 0;

  // Count public track links
  const publicTrackCount = publicTrackResult.status === 'fulfilled' && publicTrackResult.value.data
    ? await countPublicTrackLinks(userId)
    : 0;

  // Count presave links
  const preSaveCount = preSaveResult.status === 'fulfilled' && preSaveResult.value.data
    ? await countPreSaveLinks(userId)
    : 0;

  // Count email capture links
  const emailCaptureCount = emailCaptureResult.status === 'fulfilled' && emailCaptureResult.value.data
    ? await countEmailCaptureLinks(userId)
    : 0;

  const totalLinks = smartLinksCount + oneClickCount + publicTrackCount + preSaveCount + emailCaptureCount;

  // Build latest entries
  let latestSmartLink: LinkAvailability['latestSmartLink'];
  if (smartLinksResult.status === 'fulfilled' && smartLinksResult.value.data?.[0]) {
    const link = smartLinksResult.value.data[0];
    const destination_url = link.spotify_url || link.apple_music_url || link.youtube_url || `https://ghoste.one/s/${link.slug}`;
    latestSmartLink = {
      id: link.id,
      slug: link.slug,
      destination_url,
      title: link.title,
      created_at: link.created_at,
    };
  }

  let latestOneClick: LinkAvailability['latestOneClick'];
  if (oneClickResult.status === 'fulfilled' && oneClickResult.value.data?.[0]) {
    const link = oneClickResult.value.data[0];
    latestOneClick = {
      id: link.id,
      slug: link.slug,
      destination_url: link.target_url || `https://ghoste.one/o/${link.slug}`,
      title: link.title,
      created_at: link.created_at,
    };
  }

  let latestPublicTrack: LinkAvailability['latestPublicTrack'];
  if (publicTrackResult.status === 'fulfilled' && publicTrackResult.value.data?.[0]) {
    const link = publicTrackResult.value.data[0];
    latestPublicTrack = {
      id: link.id,
      destination_url: link.destination_url,
      title: link.title,
      created_at: link.created_at,
    };
  }

  const availability: LinkAvailability = {
    smartLinksCount,
    oneClickCount,
    publicTrackCount,
    preSaveCount,
    emailCaptureCount,
    totalLinks,
    latestSmartLink,
    latestOneClick,
    latestPublicTrack,
  };

  console.log('[getLinkAvailability] Result:', {
    smartLinksCount,
    oneClickCount,
    publicTrackCount,
    totalLinks,
    hasLatestSmartLink: !!latestSmartLink,
  });

  return availability;
}

async function countSmartLinks(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from('smart_links')
    .select('*', { count: 'exact', head: true })
    .eq('owner_user_id', userId);
  return count || 0;
}

async function countOneClickLinks(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from('oneclick_links')
    .select('*', { count: 'exact', head: true })
    .eq('owner_user_id', userId);
  return count || 0;
}

async function countPublicTrackLinks(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from('public_track_links')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count || 0;
}

async function countPreSaveLinks(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from('presave_links')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count || 0;
}

async function countEmailCaptureLinks(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from('email_capture_links')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count || 0;
}

// ========== META: SINGLE SOURCE OF TRUTH ==========

export interface MetaRunContext {
  hasMeta: boolean;
  accessToken: string | null;
  ad_account_id: string | null;
  ad_account_name: string | null;
  page_id: string | null;
  page_name: string | null;
  pixel_id: string | null;
  instagram_account_id: string | null;
}

/**
 * Get Meta run context from meta_credentials (SINGLE SOURCE OF TRUTH)
 * Uses service role to bypass RLS
 */
export async function getMetaRunContext(userId: string): Promise<MetaRunContext> {
  const supabase = getSupabaseAdmin();

  console.log('[getMetaRunContext] Fetching from meta_credentials for user:', userId);

  const { data: creds, error } = await supabase
    .from('meta_credentials')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[getMetaRunContext] Query error:', error);
    return {
      hasMeta: false,
      accessToken: null,
      ad_account_id: null,
      ad_account_name: null,
      page_id: null,
      page_name: null,
      pixel_id: null,
      instagram_account_id: null,
    };
  }

  if (!creds || !creds.access_token) {
    console.log('[getMetaRunContext] No Meta credentials found');
    return {
      hasMeta: false,
      accessToken: null,
      ad_account_id: null,
      ad_account_name: null,
      page_id: null,
      page_name: null,
      pixel_id: null,
      instagram_account_id: null,
    };
  }

  console.log('[getMetaRunContext] Found credentials:', {
    hasToken: !!creds.access_token,
    adAccountId: creds.ad_account_id,
    pageId: creds.page_id,
    pixelId: creds.pixel_id,
  });

  return {
    hasMeta: true,
    accessToken: creds.access_token,
    ad_account_id: creds.ad_account_id,
    ad_account_name: creds.ad_account_name,
    page_id: creds.page_id,
    page_name: creds.facebook_page_name || null,
    pixel_id: creds.pixel_id,
    instagram_account_id: creds.instagram_account_id,
  };
}

// ========== UNIFIED RUN ADS CONTEXT ==========

export interface RunAdsContext {
  meta: MetaRunContext;
  links: LinkAvailability;
  hasMeta: boolean;
  hasAnyDestination: boolean;
  destinationCandidates: {
    latestSmartLinkUrl?: string;
    latestOneClickUrl?: string;
    latestPublicTrackUrl?: string;
  };
  ready: boolean;
  blocker?: 'meta_not_connected' | 'no_destination_link';
}

/**
 * Get unified run ads context - ONE CALL THAT CAN'T LIE
 * Uses service role to bypass RLS
 */
export async function getRunAdsContext(userId: string): Promise<RunAdsContext> {
  console.log('[getRunAdsContext] Fetching canonical context for user:', userId);

  // Fetch in parallel
  const [meta, links] = await Promise.all([
    getMetaRunContext(userId),
    getLinkAvailability(userId),
  ]);

  const hasMeta = meta.hasMeta;
  const hasAnyDestination = links.totalLinks > 0;

  const destinationCandidates: RunAdsContext['destinationCandidates'] = {
    latestSmartLinkUrl: links.latestSmartLink?.destination_url,
    latestOneClickUrl: links.latestOneClick?.destination_url,
    latestPublicTrackUrl: links.latestPublicTrack?.destination_url,
  };

  const ready = hasMeta && hasAnyDestination;
  let blocker: RunAdsContext['blocker'];

  if (!hasMeta) {
    blocker = 'meta_not_connected';
  } else if (!hasAnyDestination) {
    blocker = 'no_destination_link';
  }

  const context: RunAdsContext = {
    meta,
    links,
    hasMeta,
    hasAnyDestination,
    destinationCandidates,
    ready,
    blocker,
  };

  console.log('[getRunAdsContext] Result:', {
    hasMeta: context.hasMeta,
    metaSource: context.meta.source,
    totalLinks: context.links.totalLinks,
    ready: context.ready,
    blocker: context.blocker,
  });

  return context;
}

/**
 * Format run ads context for AI prompt
 * Clear, unambiguous format with hard contract
 */
export function formatRunAdsContextForAI(context: RunAdsContext): string {
  const lines: string[] = [];

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🎯 RUN ADS STATUS (CANONICAL - SERVICE ROLE VERIFIED)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  // Meta status
  if (context.hasMeta) {
    lines.push(`✅ META CONNECTED (source: ${context.meta.source})`);
    if (context.meta.ad_account_id) {
      lines.push(`   Ad Account: ${context.meta.ad_account_name || context.meta.ad_account_id}`);
    }
    if (context.meta.page_id) {
      lines.push(`   Page: ${context.meta.page_name || context.meta.page_id}`);
    }
    if (context.meta.pixel_id) {
      lines.push(`   Pixel: ${context.meta.pixel_name || context.meta.pixel_id}`);
    }
  } else {
    lines.push('❌ META NOT CONNECTED');
    lines.push('   → User must connect Meta in Profile');
  }

  lines.push('');

  // Links status
  if (context.links.totalLinks > 0) {
    lines.push(`✅ ${context.links.totalLinks} DESTINATION LINKS AVAILABLE`);
    if (context.links.smartLinksCount > 0) {
      lines.push(`   - ${context.links.smartLinksCount} Smart Links`);
      if (context.links.latestSmartLink) {
        lines.push(`     Latest: "${context.links.latestSmartLink.title || 'Untitled'}" → ${context.links.latestSmartLink.slug}`);
      }
    }
    if (context.links.oneClickCount > 0) {
      lines.push(`   - ${context.links.oneClickCount} One-Click Links`);
    }
    if (context.links.publicTrackCount > 0) {
      lines.push(`   - ${context.links.publicTrackCount} Public Track Links`);
    }
  } else {
    lines.push('❌ NO DESTINATION LINKS YET');
    lines.push('   → User needs to provide a song URL or create a link');
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🚨 HARD CONTRACT - ZERO TOLERANCE:');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  if (context.hasMeta) {
    lines.push('✅ Meta IS connected (verified above)');
    lines.push('   → YOU MUST NEVER SAY "Meta not connected"');
    lines.push('   → YOU MUST NEVER ASK TO CONNECT META');
  } else {
    lines.push('❌ Meta NOT connected (verified above)');
    lines.push('   → Say ONLY: "Connect Meta and try again"');
    lines.push('   → Do NOT attempt campaign creation');
  }

  lines.push('');

  if (context.links.totalLinks > 0) {
    lines.push(`✅ ${context.links.totalLinks} links exist (verified above)`);
    lines.push('   → YOU MUST NEVER SAY "no links" or "create a link"');
  } else {
    lines.push('❌ NO links yet (verified above)');
    lines.push('   → Say: "Drop the song link"');
  }

  lines.push('');

  if (context.ready) {
    lines.push('✅ READY TO CREATE DRAFT');
    lines.push('   → Proceed with campaign creation (paused draft)');
  } else {
    lines.push('❌ NOT READY');
    lines.push(`   → Blocker: ${context.blocker}`);
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}
