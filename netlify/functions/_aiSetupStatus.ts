/**
 * AI Setup Status Helper
 *
 * Server-side helper that provides canonical setup status for Ghoste AI
 * Bypasses RLS by using service role and provides clean, structured data
 *
 * CRITICAL: Only call this from server-side (Netlify functions)
 * NEVER expose this directly to the client
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AISetupStatus {
  meta: {
    connected: boolean;
    hasToken: boolean;
    tokenExpired: boolean;
    adAccounts: Array<{
      id: string;
      name: string;
      accountId: string;
      currency?: string;
    }>;
    pages: Array<{
      id: string;
      name: string;
    }>;
    instagramAccounts: Array<{
      id: string;
      username: string;
    }>;
    pixels: Array<{
      id: string;
      name: string;
    }>;
    selectedAssets: {
      adAccountId: string | null;
      adAccountName: string | null;
      pageId: string | null;
      pageName: string | null;
      instagramId: string | null;
      instagramUsername: string | null;
      pixelId: string | null;
      businessId: string | null;
      businessName: string | null;
    };
    campaignsCount: number;
    activeCampaignsCount: number;
  };
  smartLinks: {
    count: number;
    recent: Array<{
      id: string;
      title: string;
      slug: string;
      createdAt: string;
    }>;
  };
  errors: string[];
}

/**
 * Get Supabase admin client
 */
function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Fetch Meta connection status
 */
async function fetchMetaStatus(supabase: SupabaseClient, userId: string) {
  const status: AISetupStatus['meta'] = {
    connected: false,
    hasToken: false,
    tokenExpired: false,
    adAccounts: [],
    pages: [],
    instagramAccounts: [],
    pixels: [],
    selectedAssets: {
      adAccountId: null,
      adAccountName: null,
      pageId: null,
      pageName: null,
      instagramId: null,
      instagramUsername: null,
      pixelId: null,
      businessId: null,
      businessName: null,
    },
    campaignsCount: 0,
    activeCampaignsCount: 0,
  };

  try {
    // Check meta_credentials for token and selected assets
    const { data: creds, error: credsError } = await supabase
      .from('meta_credentials')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (credsError) {
      console.error('[fetchMetaStatus] Credentials error:', credsError);
      return { status, error: `Credentials check failed: ${credsError.message}` };
    }

    if (!creds || !creds.access_token) {
      return { status, error: null };
    }

    // Has token = connected
    status.hasToken = true;
    status.connected = true;

    // Check if token expired
    if (creds.expires_at) {
      const expiresAt = new Date(creds.expires_at);
      if (expiresAt < new Date()) {
        status.tokenExpired = true;
      }
    }

    // Get selected assets from credentials
    status.selectedAssets = {
      adAccountId: creds.ad_account_id || null,
      adAccountName: creds.ad_account_name || null,
      pageId: creds.page_id || null,
      pageName: creds.facebook_page_name || null,
      instagramId: creds.instagram_actor_id || creds.instagram_id || null,
      instagramUsername: creds.instagram_username || null,
      pixelId: creds.pixel_id || null,
      businessId: creds.business_id || null,
      businessName: creds.business_name || null,
    };

    // Fetch ad accounts
    const { data: adAccounts } = await supabase
      .from('meta_ad_accounts')
      .select('id, account_id, ad_account_id, name, currency')
      .eq('user_id', userId);

    if (adAccounts && adAccounts.length > 0) {
      status.adAccounts = adAccounts.map(acc => ({
        id: acc.id,
        name: acc.name || 'Unnamed Account',
        accountId: acc.ad_account_id || acc.account_id || acc.id,
        currency: acc.currency,
      }));
    }

    // Fetch pages
    const { data: pages } = await supabase
      .from('meta_pages')
      .select('meta_page_id, name')
      .eq('user_id', userId);

    if (pages && pages.length > 0) {
      status.pages = pages.map(p => ({
        id: p.meta_page_id,
        name: p.name || 'Unnamed Page',
      }));
    }

    // Fetch Instagram accounts
    const { data: igAccounts } = await supabase
      .from('meta_instagram_accounts')
      .select('meta_instagram_id, username')
      .eq('user_id', userId);

    if (igAccounts && igAccounts.length > 0) {
      status.instagramAccounts = igAccounts.map(ig => ({
        id: ig.meta_instagram_id,
        username: ig.username || 'Unknown',
      }));
    }

    // Fetch pixels
    const { data: pixels } = await supabase
      .from('meta_pixels')
      .select('meta_pixel_id, name')
      .eq('user_id', userId)
      .eq('is_available', true);

    if (pixels && pixels.length > 0) {
      status.pixels = pixels.map(px => ({
        id: px.meta_pixel_id,
        name: px.name || 'Unnamed Pixel',
      }));
    }

    // Count campaigns
    const { count: totalCampaigns } = await supabase
      .from('meta_ad_campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: activeCampaigns } = await supabase
      .from('meta_ad_campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true);

    status.campaignsCount = totalCampaigns || 0;
    status.activeCampaignsCount = activeCampaigns || 0;

    return { status, error: null };
  } catch (error: any) {
    console.error('[fetchMetaStatus] Unexpected error:', error);
    return { status, error: `Meta fetch error: ${error.message}` };
  }
}

/**
 * Fetch Smart Links status
 */
async function fetchSmartLinksStatus(supabase: SupabaseClient, userId: string) {
  const status: AISetupStatus['smartLinks'] = {
    count: 0,
    recent: [],
  };

  try {
    // Get count
    const { count, error: countError } = await supabase
      .from('smart_links')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.error('[fetchSmartLinksStatus] Count error:', countError);
      return { status, error: `Smart links count failed: ${countError.message}` };
    }

    status.count = count || 0;

    // Get recent links
    const { data: links, error: linksError } = await supabase
      .from('smart_links')
      .select('id, title, slug, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (linksError) {
      console.error('[fetchSmartLinksStatus] Links error:', linksError);
      return { status, error: `Smart links fetch failed: ${linksError.message}` };
    }

    if (links && links.length > 0) {
      status.recent = links.map(link => ({
        id: link.id,
        title: link.title || 'Untitled',
        slug: link.slug,
        createdAt: link.created_at,
      }));
    }

    return { status, error: null };
  } catch (error: any) {
    console.error('[fetchSmartLinksStatus] Unexpected error:', error);
    return { status, error: `Smart links error: ${error.message}` };
  }
}

/**
 * Get complete AI setup status
 *
 * CRITICAL: Only call from server-side (Netlify functions)
 * Uses service role to bypass RLS
 */
export async function getAISetupStatus(userId: string): Promise<AISetupStatus> {
  console.log('[getAISetupStatus] Fetching setup status for user:', userId);

  const supabase = getSupabaseAdmin();
  const errors: string[] = [];

  // Fetch both in parallel
  const [metaResult, smartLinksResult] = await Promise.all([
    fetchMetaStatus(supabase, userId),
    fetchSmartLinksStatus(supabase, userId),
  ]);

  // Collect errors
  if (metaResult.error) errors.push(metaResult.error);
  if (smartLinksResult.error) errors.push(smartLinksResult.error);

  const setupStatus: AISetupStatus = {
    meta: metaResult.status,
    smartLinks: smartLinksResult.status,
    errors,
  };

  console.log('[getAISetupStatus] Status summary:', {
    metaConnected: setupStatus.meta.connected,
    metaHasToken: setupStatus.meta.hasToken,
    metaAdAccounts: setupStatus.meta.adAccounts.length,
    metaCampaigns: setupStatus.meta.campaignsCount,
    smartLinksCount: setupStatus.smartLinks.count,
    errorsCount: setupStatus.errors.length,
  });

  return setupStatus;
}

/**
 * Format setup status for AI prompt
 */
export function formatSetupStatusForAI(status: AISetupStatus): string {
  const lines: string[] = [];

  lines.push('=== SETUP STATUS ===');
  lines.push('');

  // Meta status
  lines.push('Meta Connection:');
  if (status.meta.connected) {
    lines.push('  ✅ Connected');
    if (status.meta.tokenExpired) {
      lines.push('  ⚠️  Token expired - user needs to reconnect');
    }

    if (status.meta.selectedAssets.adAccountId) {
      lines.push(`  Ad Account: ${status.meta.selectedAssets.adAccountName || status.meta.selectedAssets.adAccountId}`);
    } else if (status.meta.adAccounts.length > 0) {
      lines.push(`  Ad Accounts Available: ${status.meta.adAccounts.length}`);
      status.meta.adAccounts.slice(0, 3).forEach(acc => {
        lines.push(`    - ${acc.name} (${acc.accountId})`);
      });
    }

    if (status.meta.selectedAssets.pixelId) {
      lines.push(`  Pixel: ${status.meta.selectedAssets.pixelId}`);
    } else if (status.meta.pixels.length > 0) {
      lines.push(`  Pixels Available: ${status.meta.pixels.length}`);
    }

    if (status.meta.selectedAssets.pageId) {
      lines.push(`  Facebook Page: ${status.meta.selectedAssets.pageName || status.meta.selectedAssets.pageId}`);
    }

    if (status.meta.selectedAssets.instagramId) {
      lines.push(`  Instagram: @${status.meta.selectedAssets.instagramUsername || status.meta.selectedAssets.instagramId}`);
    }

    lines.push(`  Active Campaigns: ${status.meta.activeCampaignsCount} of ${status.meta.campaignsCount} total`);
  } else {
    lines.push('  ❌ NOT CONNECTED');
    lines.push('  → User must connect Meta in Profile → Connected Accounts');
  }

  lines.push('');

  // Smart Links status
  lines.push('Smart Links:');
  if (status.smartLinks.count > 0) {
    lines.push(`  ✅ ${status.smartLinks.count} smart link${status.smartLinks.count === 1 ? '' : 's'} available`);
    if (status.smartLinks.recent.length > 0) {
      lines.push('  Recent links:');
      status.smartLinks.recent.forEach(link => {
        lines.push(`    - "${link.title}" → ghoste.one/s/${link.slug}`);
      });
    }
  } else {
    lines.push('  ❌ NO SMART LINKS');
    lines.push('  → User must create a smart link first');
    lines.push('  → Smart links are required to run ads');
  }

  lines.push('');

  // Errors
  if (status.errors.length > 0) {
    lines.push('⚠️  Errors:');
    status.errors.forEach(err => lines.push(`  - ${err}`));
    lines.push('');
  }

  lines.push('=== END SETUP STATUS ===');

  return lines.join('\n');
}
