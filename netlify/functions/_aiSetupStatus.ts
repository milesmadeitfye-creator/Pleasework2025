/**
 * AI Setup Status Helper
 *
 * Server-side helper that provides canonical setup status for Ghoste AI
 * Uses the public.ai_get_setup_status RPC (SECURITY DEFINER) as single source of truth
 *
 * CRITICAL: Only call this from server-side (Netlify functions)
 * NEVER expose this directly to the client
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// RPC response structure (matches DB function output)
interface RPCSetupStatus {
  meta: {
    has_meta: boolean;
    source_table: string | null;
    ad_accounts: Array<{
      id: string;
      account_id: string;
      name: string;
      currency?: string;
    }>;
    pages: Array<{
      id: string;
      name: string;
      category?: string;
    }>;
    pixels: Array<{
      id: string;
      name: string;
      is_available: boolean;
    }>;
    instagram_accounts: Array<{
      id: string;
      username: string;
      profile_picture_url?: string;
    }>;
  };
  smart_links_count: number;
  smart_links_preview: Array<{
    id: string;
    title: string;
    slug: string;
    destination_url: string;
    created_at: string;
  }>;
}

// Client-facing structure (formatted for AI consumption)
export interface AISetupStatus {
  meta: {
    connected: boolean;
    sourceTable: string | null;
    adAccounts: Array<{
      id: string;
      name: string;
      accountId: string;
      currency?: string;
      source?: string; // 'profile_fallback' if from user_profiles
    }>;
    pages: Array<{
      id: string;
      name: string;
      category?: string;
      source?: string; // 'profile_fallback' if from user_profiles
    }>;
    instagramAccounts: Array<{
      id: string;
      username: string;
      profilePictureUrl?: string;
    }>;
    pixels: Array<{
      id: string;
      name: string;
      isAvailable: boolean;
      source?: string; // 'profile_fallback' if from user_profiles
    }>;
  };
  smartLinks: {
    count: number;
    recent: Array<{
      id: string;
      title: string;
      slug: string;
      destinationUrl: string;
      createdAt: string;
    }>;
  };
  resolved: {
    adAccountId: string | null;
    pageId: string | null;
    pixelId: string | null;
    destinationUrl: string | null;
  };
  errors: string[];
}

/**
 * Get Supabase admin client (service role)
 */
function getSupabaseAdmin(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[_aiSetupStatus] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Transform RPC response to client-facing format
 */
function transformRPCResponse(rpcData: any): Omit<AISetupStatus, 'errors'> {
  return {
    meta: {
      connected: rpcData.meta.has_meta,
      sourceTable: rpcData.meta.source_table,
      adAccounts: (rpcData.meta.ad_accounts || []).map((acc: any) => ({
        id: acc.id,
        name: acc.name,
        accountId: acc.account_id,
        currency: acc.currency,
        source: acc.source,
      })),
      pages: (rpcData.meta.pages || []).map((page: any) => ({
        id: page.id,
        name: page.name,
        category: page.category,
        source: page.source,
      })),
      instagramAccounts: (rpcData.meta.instagram_accounts || []).map((ig: any) => ({
        id: ig.id,
        username: ig.username,
        profilePictureUrl: ig.profile_picture_url,
      })),
      pixels: (rpcData.meta.pixels || []).map((px: any) => ({
        id: px.id,
        name: px.name,
        isAvailable: px.is_available,
        source: px.source,
      })),
    },
    smartLinks: {
      count: rpcData.smart_links_count || 0,
      recent: (rpcData.smart_links_preview || []).map((link: any) => ({
        id: link.id,
        title: link.title,
        slug: link.slug,
        destinationUrl: link.destination_url,
        createdAt: link.created_at,
      })),
    },
    resolved: {
      adAccountId: rpcData.resolved?.ad_account_id || null,
      pageId: rpcData.resolved?.page_id || null,
      pixelId: rpcData.resolved?.pixel_id || null,
      destinationUrl: rpcData.resolved?.destination_url || null,
    },
  };
}

/**
 * Call the canonical RPC function
 * This is the SINGLE SOURCE OF TRUTH for AI setup status
 */
async function callSetupStatusRPC(supabase: SupabaseClient | null, userId: string): Promise<any> {
  console.log('[callSetupStatusRPC] Calling ai_get_setup_status RPC for user:', userId);

  if (!supabase) {
    throw new Error('Supabase not configured - cannot call RPC');
  }

  const { data, error } = await supabase.rpc('ai_get_setup_status', {
    p_user_id: userId,
  });

  if (error) {
    console.error('[callSetupStatusRPC] RPC error:', error);
    throw new Error(`RPC failed: ${error.message}`);
  }

  if (!data) {
    throw new Error('RPC returned no data');
  }

  console.log('[callSetupStatusRPC] RPC success:', {
    has_meta: data.meta?.has_meta,
    source_table: data.meta?.source_table,
    ad_accounts: data.meta?.ad_accounts?.length || 0,
    pages: data.meta?.pages?.length || 0,
    pixels: data.meta?.pixels?.length || 0,
    smart_links_count: data.smart_links_count,
    resolved_ad_account: data.resolved?.ad_account_id || null,
    resolved_page: data.resolved?.page_id || null,
    resolved_pixel: data.resolved?.pixel_id || null,
    resolved_destination: data.resolved?.destination_url || null,
  });

  return data;
}

/**
 * Get complete AI setup status
 *
 * CRITICAL: Only call from server-side (Netlify functions)
 * Uses the ai_get_setup_status RPC (SECURITY DEFINER) as canonical source of truth
 */
export async function getAISetupStatus(userId: string): Promise<AISetupStatus> {
  console.log('[getAISetupStatus] Fetching canonical setup status for user:', userId);

  const supabase = getSupabaseAdmin();
  const errors: string[] = [];

  try {
    // Call the canonical RPC - single source of truth
    const rpcData = await callSetupStatusRPC(supabase, userId);

    // Transform to client-facing format
    const setupStatus: AISetupStatus = {
      ...transformRPCResponse(rpcData),
      errors,
    };

    console.log('[getAISetupStatus] Status summary:', {
      metaConnected: setupStatus.meta.connected,
      sourceTable: setupStatus.meta.sourceTable,
      metaAdAccounts: setupStatus.meta.adAccounts.length,
      metaPages: setupStatus.meta.pages.length,
      metaPixels: setupStatus.meta.pixels.length,
      smartLinksCount: setupStatus.smartLinks.count,
      smartLinksWithDestination: setupStatus.smartLinks.recent.filter(l => l.destinationUrl).length,
      resolvedAdAccount: setupStatus.resolved.adAccountId,
      resolvedPage: setupStatus.resolved.pageId,
      resolvedPixel: setupStatus.resolved.pixelId,
      resolvedDestination: setupStatus.resolved.destinationUrl,
    });

    return setupStatus;
  } catch (error: any) {
    console.error('[getAISetupStatus] Failed to fetch setup status:', error);
    errors.push(`Setup status fetch failed: ${error.message}`);

    // Return empty status on error
    return {
      meta: {
        connected: false,
        sourceTable: null,
        adAccounts: [],
        pages: [],
        instagramAccounts: [],
        pixels: [],
      },
      smartLinks: {
        count: 0,
        recent: [],
      },
      resolved: {
        adAccountId: null,
        pageId: null,
        pixelId: null,
        destinationUrl: null,
      },
      errors,
    };
  }
}

/**
 * Format setup status for AI prompt
 */
export function formatSetupStatusForAI(status: AISetupStatus): string {
  const lines: string[] = [];

  lines.push('=== CANONICAL SETUP STATUS (from RPC) ===');
  lines.push('');

  // RESOLVED ASSETS (single source of truth - no contradictions)
  const hasResolvedAssets = Boolean(
    status.resolved.adAccountId ||
    status.resolved.pageId ||
    status.resolved.pixelId
  );

  lines.push('Meta Assets (Resolved):');
  if (hasResolvedAssets) {
    lines.push(`  ✅ AVAILABLE (source: ${status.meta.sourceTable || 'profile_fallback'})`);

    if (status.resolved.adAccountId) {
      const acc = status.meta.adAccounts.find(a => a.id === status.resolved.adAccountId);
      const accName = acc?.name || 'Default';
      const accSource = acc?.source === 'profile_fallback' ? ' [from profile]' : '';
      lines.push(`  Ad Account: ${accName} (${status.resolved.adAccountId})${accSource}`);
    }

    if (status.resolved.pageId) {
      const page = status.meta.pages.find(p => p.id === status.resolved.pageId);
      const pageName = page?.name || 'Default';
      const pageSource = page?.source === 'profile_fallback' ? ' [from profile]' : '';
      lines.push(`  Facebook Page: ${pageName} (${status.resolved.pageId})${pageSource}`);
    }

    if (status.resolved.pixelId) {
      const pixel = status.meta.pixels.find(p => p.id === status.resolved.pixelId);
      const pixelName = pixel?.name || 'Default';
      const pixelSource = pixel?.source === 'profile_fallback' ? ' [from profile]' : '';
      lines.push(`  Pixel: ${pixelName} (${status.resolved.pixelId})${pixelSource}`);
    }

    if (status.meta.instagramAccounts.length > 0) {
      lines.push(`  Instagram Accounts: ${status.meta.instagramAccounts.length}`);
      status.meta.instagramAccounts.slice(0, 2).forEach(ig => {
        lines.push(`    - @${ig.username}`);
      });
    }
  } else {
    lines.push('  ❌ NOT CONFIGURED');
    lines.push('  → User must connect Meta in Profile → Connected Accounts');
    lines.push('  → DO NOT create ads or campaigns until Meta assets are configured');
  }

  lines.push('');

  // Destination URL (resolved)
  lines.push('Ad Destination:');
  if (status.resolved.destinationUrl) {
    lines.push(`  ✅ ${status.resolved.destinationUrl}`);
    if (status.smartLinks.count === 0) {
      lines.push('  [Using profile default - suggest creating smart link for tracking]');
    } else {
      lines.push(`  [${status.smartLinks.count} smart link${status.smartLinks.count === 1 ? '' : 's'} available]`);
    }
  } else {
    lines.push('  ❌ NO DESTINATION');
    if (status.smartLinks.count === 0) {
      lines.push('  → User must create a smart link or set default_ad_destination_url');
    } else {
      lines.push(`  → ${status.smartLinks.count} smart links exist but no destination resolved`);
    }
  }

  lines.push('');

  // Smart Links (informational)
  if (status.smartLinks.count > 0 && status.smartLinks.recent.length > 0) {
    lines.push('Smart Links (Recent):');
    status.smartLinks.recent.slice(0, 3).forEach(link => {
      lines.push(`  - "${link.title}" (ghoste.one/s/${link.slug})`);
    });
    lines.push('');
  }

  // Critical AI rules
  lines.push('CRITICAL AI RULES:');
  lines.push(`  1. Meta assets available = ${hasResolvedAssets} (DO NOT contradict this)`);
  lines.push(`  2. Destination URL = ${status.resolved.destinationUrl ? 'available' : 'missing'}`);
  lines.push(`  3. If assets available AND destination exists, ads CAN be created`);
  lines.push(`  4. NEVER say "not connected" if resolved assets exist (even from profile fallback)`);
  lines.push(`  5. Source "${status.meta.sourceTable}" includes profile_fallback as valid`);

  // Errors
  if (status.errors.length > 0) {
    lines.push('');
    lines.push('⚠️  Errors:');
    status.errors.forEach(err => lines.push(`  - ${err}`));
  }

  lines.push('');
  lines.push('=== END CANONICAL SETUP STATUS ===');

  return lines.join('\n');
}
