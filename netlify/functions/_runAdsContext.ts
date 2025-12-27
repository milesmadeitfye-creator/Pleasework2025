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
 * CRITICAL: Uses ai_get_setup_status RPC - SAME source as UI "Meta connected" card.
 * This is the SINGLE SOURCE OF TRUTH for "can user run ads?"
 *
 * NO separate detection logic. NO re-querying. Uses canonical RPC ONLY.
 */
export async function getRunAdsContext(userId: string): Promise<RunAdsContext> {
  const supabase = getSupabaseAdmin();

  console.log('[getRunAdsContext] Fetching for user:', userId);

  // 1. Call ai_get_setup_status RPC (SAME AS UI)
  const { data: setupData, error: rpcError } = await supabase
    .rpc('ai_get_setup_status', { p_user_id: userId });

  if (rpcError) {
    console.error('[getRunAdsContext] RPC error:', rpcError);
    // Fallback: assume not connected if RPC fails
    return {
      hasMeta: false,
      meta: {
        ad_account_id: null,
        ad_account_name: null,
        page_id: null,
        page_name: null,
        pixel_id: null,
        pixel_name: null,
        instagram_id: null,
        instagram_username: null,
      },
      smartLinksCount: 0,
      smartLinks: [],
      ready: false,
      blocker: 'meta_not_connected',
    };
  }

  const hasMeta = setupData?.meta?.has_meta ?? false;
  const adAccounts = setupData?.meta?.ad_accounts || [];
  const pages = setupData?.meta?.pages || [];
  const pixels = setupData?.meta?.pixels || [];
  const instagram_accounts = setupData?.meta?.instagram_accounts || [];

  const hasAdAccount = adAccounts.length > 0;
  const hasPage = pages.length > 0;

  // 2. Get smart links from RPC (SAME AS UI)
  const smartLinksCount = setupData?.smart_links_count || 0;
  const smartLinksPreview = setupData?.smart_links_preview || [];

  const smartLinks = smartLinksPreview.map((link: any) => ({
    id: link.id,
    slug: link.slug || '',
    title: link.title || 'Untitled',
    destination_url: link.destination_url || `https://ghoste.one/s/${link.slug}`,
    created_at: link.created_at || '',
  }));

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
      ad_account_id: hasAdAccount ? (adAccounts[0].account_id || adAccounts[0].id) : null,
      ad_account_name: hasAdAccount ? adAccounts[0].name : null,
      page_id: hasPage ? pages[0].id : null,
      page_name: hasPage ? pages[0].name : null,
      pixel_id: pixels.length > 0 ? pixels[0].id : null,
      pixel_name: pixels.length > 0 ? pixels[0].name : null,
      instagram_id: instagram_accounts.length > 0 ? instagram_accounts[0].id : null,
      instagram_username: instagram_accounts.length > 0 ? instagram_accounts[0].username : null,
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
  lines.push('🎯 RUN ADS STATUS (FROM ai_get_setup_status RPC - SAME AS UI)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  // Meta status
  if (context.hasMeta) {
    lines.push('✅ META CONNECTED (verified by RPC)');
    if (context.meta.ad_account_id) {
      lines.push(`   Ad Account: ${context.meta.ad_account_name || 'ID: ' + context.meta.ad_account_id}`);
    }
    if (context.meta.page_id) {
      lines.push(`   Page: ${context.meta.page_name || 'ID: ' + context.meta.page_id}`);
    }
  } else {
    lines.push('❌ META NOT CONNECTED (verified by RPC)');
    lines.push('   → User must connect Meta in Profile → Connected Accounts');
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
    lines.push('✅ Meta IS connected (RPC says has_meta=true)');
    lines.push('   → YOU MUST NEVER SAY "Meta not connected"');
    lines.push('   → YOU MUST NEVER ASK USER TO CONNECT META');
    lines.push('   → THIS IS A HARD CONTRACT - NO EXCEPTIONS');
  } else {
    lines.push('❌ Meta NOT connected (RPC says has_meta=false)');
    lines.push('   → Tell user: "Connect Meta and try again"');
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
