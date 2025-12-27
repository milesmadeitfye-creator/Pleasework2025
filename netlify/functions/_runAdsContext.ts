/**
 * Run Ads Context - Single Source of Truth
 *
 * Used by Ghoste AI to check ad readiness WITHOUT false negatives.
 * Reads from same tables as Ads Manager UI.
 *
 * CRITICAL: This replaces duplicated detection logic in AI prompts.
 */

import { getSupabaseAdmin } from './_supabaseAdmin';

export interface RunAdsContext {
  // Meta connection (from meta_credentials)
  hasMeta: boolean;
  meta: {
    ad_account_id: string | null;
    ad_account_name: string | null;
    page_id: string | null;
    page_name: string | null;
    pixel_id: string | null;
    pixel_name: string | null;
    instagram_id: string | null;
    instagram_username: string | null;
  };

  // Smart links (from smart_links table)
  smartLinksCount: number;
  smartLinks: Array<{
    id: string;
    slug: string;
    title: string;
    destination_url: string;
    created_at: string;
  }>;

  // Readiness summary
  ready: boolean;
  blocker?: string;
}

/**
 * Get run ads context for user
 *
 * This is the SINGLE SOURCE OF TRUTH for "can user run ads?"
 * No caching, no stale data - fresh DB queries every time.
 */
export async function getRunAdsContext(userId: string): Promise<RunAdsContext> {
  const supabase = getSupabaseAdmin();

  console.log('[getRunAdsContext] Fetching for user:', userId);

  // 1. Check Meta connection (same as truth check)
  const { data: metaCreds, error: metaError } = await supabase
    .from('meta_credentials')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (metaError) {
    console.error('[getRunAdsContext] Meta query error:', metaError);
  }

  const hasMeta = !!(metaCreds && metaCreds.access_token);
  const hasAdAccount = !!(metaCreds && metaCreds.ad_account_id);
  const hasPage = !!(metaCreds && metaCreds.page_id);

  // 2. Get smart links (with destination URLs resolved)
  const { data: smartLinksData, error: linksError } = await supabase
    .from('smart_links')
    .select('id, slug, title, spotify_url, apple_music_url, youtube_url, youtube_music_url, tidal_url, soundcloud_url, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (linksError) {
    console.error('[getRunAdsContext] Smart links query error:', linksError);
  }

  // Resolve destination URLs for each link
  const smartLinks = (smartLinksData || []).map(link => {
    let destination_url = '';

    // Try platform URLs first
    if (link.spotify_url) destination_url = link.spotify_url;
    else if (link.apple_music_url) destination_url = link.apple_music_url;
    else if (link.youtube_url) destination_url = link.youtube_url;
    else if (link.youtube_music_url) destination_url = link.youtube_music_url;
    else if (link.tidal_url) destination_url = link.tidal_url;
    else if (link.soundcloud_url) destination_url = link.soundcloud_url;
    else if (link.slug) destination_url = `https://ghoste.one/s/${link.slug}`;

    return {
      id: link.id,
      slug: link.slug || '',
      title: link.title || 'Untitled',
      destination_url,
      created_at: link.created_at,
    };
  });

  const smartLinksCount = smartLinks.length;

  // 3. Determine readiness
  const ready = hasMeta && hasAdAccount && hasPage;
  let blocker: string | undefined;

  if (!hasMeta) {
    blocker = 'meta_not_connected';
  } else if (!hasAdAccount) {
    blocker = 'no_ad_account';
  } else if (!hasPage) {
    blocker = 'no_page';
  }

  const context: RunAdsContext = {
    hasMeta,
    meta: {
      ad_account_id: metaCreds?.ad_account_id || null,
      ad_account_name: metaCreds?.ad_account_name || null,
      page_id: metaCreds?.page_id || null,
      page_name: metaCreds?.page_name || null,
      pixel_id: metaCreds?.pixel_id || null,
      pixel_name: metaCreds?.pixel_name || null,
      instagram_id: metaCreds?.instagram_actor_id || null,
      instagram_username: metaCreds?.instagram_username || null,
    },
    smartLinksCount,
    smartLinks,
    ready,
    blocker,
  };

  console.log('[getRunAdsContext] Result:', {
    hasMeta: context.hasMeta,
    hasAdAccount,
    hasPage,
    smartLinksCount: context.smartLinksCount,
    ready: context.ready,
    blocker: context.blocker,
  });

  return context;
}

/**
 * Format run ads context for AI prompt
 *
 * Simple, clear format that AI can't misinterpret.
 */
export function formatRunAdsContextForAI(context: RunAdsContext): string {
  const lines: string[] = [];

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🎯 RUN ADS STATUS (LIVE FROM DB - NO CACHE)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  // Meta status
  if (context.hasMeta) {
    lines.push('✅ META CONNECTED');
    if (context.meta.ad_account_id) {
      lines.push(`   Ad Account: ${context.meta.ad_account_name || context.meta.ad_account_id}`);
    }
    if (context.meta.page_id) {
      lines.push(`   Page: ${context.meta.page_name || context.meta.page_id}`);
    }
    if (context.meta.pixel_id) {
      lines.push(`   Pixel: ${context.meta.pixel_name || context.meta.pixel_id}`);
    }
    if (context.meta.instagram_id) {
      lines.push(`   Instagram: @${context.meta.instagram_username || context.meta.instagram_id}`);
    }
  } else {
    lines.push('❌ META NOT CONNECTED');
    lines.push('   → Guide user to Profile → Connected Accounts');
  }

  lines.push('');

  // Smart links
  if (context.smartLinksCount > 0) {
    lines.push(`✅ ${context.smartLinksCount} SMART LINK${context.smartLinksCount === 1 ? '' : 'S'} AVAILABLE`);
    lines.push('   Recent links you can promote:');
    context.smartLinks.slice(0, 5).forEach(link => {
      lines.push(`   - "${link.title}" → ghoste.one/s/${link.slug}`);
      if (link.destination_url && !link.destination_url.includes('ghoste.one')) {
        lines.push(`     (points to: ${link.destination_url})`);
      }
    });
  } else {
    lines.push('❌ NO SMART LINKS YET');
    lines.push('   → User needs a smart link OR you can auto-create from URL');
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🚨 CRITICAL RULES - FOLLOW EXACTLY:');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  if (context.hasMeta) {
    lines.push('✅ Meta IS connected (verified above)');
    lines.push('   → NEVER say "Meta not connected"');
    lines.push('   → NEVER ask user to connect Meta');
  } else {
    lines.push('❌ Meta NOT connected (verified above)');
    lines.push('   → Tell user to connect Meta in Profile');
    lines.push('   → Do NOT attempt to create ads');
  }

  lines.push('');

  if (context.smartLinksCount > 0) {
    lines.push(`✅ ${context.smartLinksCount} smart links exist (verified above)`);
    lines.push('   → NEVER say "no smart links" or "create a smart link"');
    lines.push('   → Reference these links by name when user asks about promotion');
  } else {
    lines.push('❌ NO smart links yet (verified above)');
    lines.push('   → If user provides Spotify/Apple/YouTube URL, auto-create smart link');
    lines.push('   → Otherwise, ask user to create smart link first');
  }

  lines.push('');

  if (context.ready) {
    lines.push('✅ READY TO RUN ADS');
    lines.push('   → User can launch campaigns immediately');
  } else {
    lines.push('❌ NOT READY TO RUN ADS');
    lines.push(`   → Blocker: ${context.blocker}`);
    if (context.blocker === 'meta_not_connected') {
      lines.push('   → Next step: Connect Meta in Profile');
    } else if (context.blocker === 'no_ad_account') {
      lines.push('   → Next step: Select ad account in Profile');
    } else if (context.blocker === 'no_page') {
      lines.push('   → Next step: Select Facebook page in Profile');
    }
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}
