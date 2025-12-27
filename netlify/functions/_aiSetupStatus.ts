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
 * CRITICAL: Returns BOTH flat fields (backward compat) AND nested meta/resolved
 */
function transformRPCResponse(rpcData: any): Omit<AISetupStatus, 'errors'> {
  // FAST-PATH: Handle FLAT RPC payload directly
  const isFlat =
    rpcData &&
    (rpcData.adAccountId || rpcData.pageId || rpcData.pixelId || rpcData.destinationUrl);

  if (isFlat) {
    console.log('[transformRPCResponse] Using FLAT payload fast-path');

    // Extract resolved values from flat fields
    const resolved = {
      adAccountId: rpcData.adAccountId || null,
      pageId: rpcData.pageId || null,
      pixelId: rpcData.pixelId || null,
      destinationUrl: rpcData.destinationUrl || null,
    };

    // Build Instagram accounts from flat or array
    let instagramAccounts: any[] = [];
    if (Array.isArray(rpcData.instagramAccounts)) {
      instagramAccounts = rpcData.instagramAccounts.map((ig: any) => ({
        id: ig.id || ig.instagramActorId,
        username: ig.username || ig.instagramUsername,
        profilePictureUrl: ig.profile_picture_url,
      }));
    } else if (rpcData.instagramActorId || rpcData.instagramId) {
      instagramAccounts = [{
        id: rpcData.instagramActorId || rpcData.instagramId,
        username: rpcData.instagramUsername || null,
        profilePictureUrl: null,
      }];
    }

    const metaConnected = !!(resolved.adAccountId && resolved.pageId && resolved.pixelId);

    return {
      meta: {
        connected: metaConnected,
        sourceTable: 'user_profiles',
        adAccounts: resolved.adAccountId ? [{
          id: resolved.adAccountId,
          name: null,
          accountId: resolved.adAccountId,
          currency: null,
          source: 'profile_fallback',
        }] : [],
        pages: resolved.pageId ? [{
          id: resolved.pageId,
          name: null,
          category: null,
          source: 'profile_fallback',
        }] : [],
        pixels: resolved.pixelId ? [{
          id: resolved.pixelId,
          name: null,
          isAvailable: true,
          source: 'profile_fallback',
        }] : [],
        instagramAccounts,
      },
      smartLinks: {
        count: rpcData.smartLinksCount || 0,
        recent: Array.isArray(rpcData.smartLinks)
          ? rpcData.smartLinks.map((link: any) => ({
              id: link.id,
              title: link.title || link.trackTitle,
              slug: link.slug,
              destinationUrl: link.destinationUrl || link.destination_url,
              createdAt: link.createdAt || link.created_at,
            }))
          : [],
      },
      resolved,
    };
  }

  // LEGACY PATH: Handle nested RPC payload
  console.log('[transformRPCResponse] Using legacy nested payload path');

  const resolved = {
    adAccountId: rpcData.resolved?.ad_account_id || null,
    pageId: rpcData.resolved?.page_id || null,
    pixelId: rpcData.resolved?.pixel_id || null,
    destinationUrl: rpcData.resolved?.destination_url || null,
  };

  const instagramAccounts = (rpcData.meta?.instagram_accounts || []).map((ig: any) => ({
    id: ig.id,
    username: ig.username,
    profilePictureUrl: ig.profile_picture_url,
  }));

  const firstInstagram = instagramAccounts[0] || null;

  return {
    meta: {
      connected: rpcData.meta?.has_meta || false,
      sourceTable: rpcData.meta?.source_table || null,
      adAccounts: (rpcData.meta?.ad_accounts || []).map((acc: any) => ({
        id: acc.id,
        name: acc.name,
        accountId: acc.account_id,
        currency: acc.currency,
        source: acc.source,
      })),
      pages: (rpcData.meta?.pages || []).map((page: any) => ({
        id: page.id,
        name: page.name,
        category: page.category,
        source: page.source,
      })),
      instagramAccounts,
      pixels: (rpcData.meta?.pixels || []).map((px: any) => ({
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
    resolved,
  };
}

/**
 * Normalize RPC response to include BOTH shapes:
 * - Flat fields (adAccountId, pageId, pixelId, etc.) for backward compat
 * - Nested fields (meta, resolved) for structured access
 *
 * This ensures all consumers get consistent data regardless of which shape they expect
 */
export function normalizeSetupStatus(rpcData: any): any {
  if (!rpcData) {
    return {
      meta: { has_meta: false },
      resolved: {},
      adAccountId: null,
      pageId: null,
      pixelId: null,
      destinationUrl: null,
    };
  }

  // FAST-PATH: Detect FLAT RPC payload (new format from ai_get_setup_status)
  // The RPC returns flat fields like: adAccountId, pageId, pixelId, etc.
  const isFlat =
    rpcData &&
    (rpcData.adAccountId || rpcData.pageId || rpcData.pixelId || rpcData.destinationUrl ||
     rpcData.instagramActorId || rpcData.instagramId);

  if (isFlat) {
    console.log('[normalizeSetupStatus] Detected FLAT RPC payload - using fast-path');

    const metaConnected = !!(rpcData.adAccountId && rpcData.pageId && rpcData.pixelId);

    // Build Instagram accounts array from flat fields
    let instagramAccounts: any[] = [];
    if (Array.isArray(rpcData.instagramAccounts)) {
      instagramAccounts = rpcData.instagramAccounts;
    } else if (rpcData.instagramId || rpcData.instagramActorId) {
      instagramAccounts = [{
        id: rpcData.instagramActorId || rpcData.instagramId,
        username: rpcData.instagramUsername || null,
        page_id: rpcData.pageId || null,
        page_name: null,
      }];
    }

    const firstInstagram = instagramAccounts[0];

    const normalized = {
      // Nested meta structure
      meta: {
        has_meta: metaConnected,
        source_table: 'user_profiles',
        ad_accounts: rpcData.adAccountId ? [{
          id: rpcData.adAccountId,
          account_id: rpcData.adAccountId,
          name: null,
          account_status: null,
          source: 'profile_fallback',
        }] : [],
        pages: rpcData.pageId ? [{
          id: rpcData.pageId,
          name: null,
          source: 'profile_fallback',
        }] : [],
        pixels: rpcData.pixelId ? [{
          id: rpcData.pixelId,
          name: null,
          ad_account_id: rpcData.adAccountId || null,
          source: 'profile_fallback',
        }] : [],
        instagram_accounts: instagramAccounts,
      },
      // Nested resolved structure (snake_case for server compatibility)
      resolved: {
        ad_account_id: rpcData.adAccountId || null,
        page_id: rpcData.pageId || null,
        pixel_id: rpcData.pixelId || null,
        destination_url: rpcData.destinationUrl || null,
        instagram_actor_id: firstInstagram?.id || rpcData.instagramActorId || null,
        instagram_username: firstInstagram?.username || rpcData.instagramUsername || null,
      },
      smart_links_count: rpcData.smartLinksCount || 0,
      smart_links_preview: rpcData.smartLinks || [],
      // Flat fields (backward compat - camelCase)
      adAccountId: rpcData.adAccountId || null,
      pageId: rpcData.pageId || null,
      pixelId: rpcData.pixelId || null,
      destinationUrl: rpcData.destinationUrl || null,
      instagramActorId: firstInstagram?.id || rpcData.instagramActorId || null,
      instagramUsername: firstInstagram?.username || rpcData.instagramUsername || null,
      instagramId: rpcData.instagramId || firstInstagram?.id || null,
      defaultInstagramId: rpcData.defaultInstagramId || firstInstagram?.id || null,
    };

    console.log('[normalizeSetupStatus] FLAT payload normalized:', {
      metaConnected,
      adAccountId: normalized.adAccountId,
      pageId: normalized.pageId,
      pixelId: normalized.pixelId,
      destinationUrl: normalized.destinationUrl,
      instagramAccounts: instagramAccounts.length,
    });

    return normalized;
  }

  // LEGACY PATH: Handle nested RPC payload (old format)
  console.log('[normalizeSetupStatus] Using legacy nested payload path');

  const resolved = rpcData.resolved || {};
  const meta = rpcData.meta || {};
  const instagramAccounts = meta.instagram_accounts || [];
  const firstInstagram = instagramAccounts[0];

  // Create normalized object with BOTH flat and nested fields
  const normalized = {
    // Preserve original nested structure
    meta: {
      has_meta: meta.has_meta || false,
      source_table: meta.source_table || null,
      ad_accounts: meta.ad_accounts || [],
      pages: meta.pages || [],
      pixels: meta.pixels || [],
      instagram_accounts: instagramAccounts,
    },
    resolved: {
      ad_account_id: resolved.ad_account_id || null,
      page_id: resolved.page_id || null,
      pixel_id: resolved.pixel_id || null,
      destination_url: resolved.destination_url || null,
      instagram_actor_id: firstInstagram?.id || null,
      instagram_username: firstInstagram?.username || null,
    },
    smart_links_count: rpcData.smart_links_count || 0,
    smart_links_preview: rpcData.smart_links_preview || [],

    // Add flat fields (backward compat)
    adAccountId: resolved.ad_account_id || null,
    pageId: resolved.page_id || null,
    pixelId: resolved.pixel_id || null,
    destinationUrl: resolved.destination_url || null,
    instagramActorId: firstInstagram?.id || null,
    instagramUsername: firstInstagram?.username || null,
  };

  return normalized;
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

  // Normalize the response to include both flat and nested fields
  const normalized = normalizeSetupStatus(data);

  console.log('[callSetupStatusRPC] RPC success (normalized):', {
    has_meta: normalized.meta?.has_meta,
    source_table: normalized.meta?.source_table,
    ad_accounts: normalized.meta?.ad_accounts?.length || 0,
    pages: normalized.meta?.pages?.length || 0,
    pixels: normalized.meta?.pixels?.length || 0,
    smart_links_count: normalized.smart_links_count,
    // Flat fields
    adAccountId: normalized.adAccountId,
    pageId: normalized.pageId,
    pixelId: normalized.pixelId,
    destinationUrl: normalized.destinationUrl,
    // Resolved fields
    resolved_ad_account: normalized.resolved?.ad_account_id || null,
    resolved_page: normalized.resolved?.page_id || null,
    resolved_pixel: normalized.resolved?.pixel_id || null,
    resolved_destination: normalized.resolved?.destination_url || null,
  });

  return normalized;
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

  // RAW SETUPSTATUS OBJECT (for AI to parse and reference directly)
  lines.push('RAW setupStatus (authoritative - use these exact values when answering):');
  lines.push('```json');
  lines.push(JSON.stringify({
    adAccountId: status.resolved.adAccountId,
    pageId: status.resolved.pageId,
    pixelId: status.resolved.pixelId,
    destinationUrl: status.resolved.destinationUrl,
    instagramAccounts: status.meta.instagramAccounts.map(ig => ({
      instagramActorId: ig.id,
      instagramId: ig.id,
      instagramUsername: ig.username,
    })),
    defaultInstagramId: status.meta.instagramAccounts[0]?.id || null,
    smartLinksCount: status.smartLinks.count,
    smartLinks: status.smartLinks.recent.map(link => ({
      id: link.id,
      title: link.title,
      slug: link.slug,
      url: `https://ghoste.one/s/${link.slug}`,
      destinationUrl: link.destinationUrl,
    })),
    metaConnected: Boolean(
      status.resolved.adAccountId ||
      status.resolved.pageId ||
      status.resolved.pixelId
    ),
    sourceTable: status.meta.sourceTable,
  }, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('🚨 CRITICAL: When user asks "What is my Meta setup status?", you MUST print these exact values above.');
  lines.push('DO NOT say "I cannot call RPCs" or "no data available" - the data is RIGHT HERE in this context.');
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
        lines.push(`    - @${ig.username} (ID: ${ig.id})`);
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
  lines.push(`  5. NEVER say "I cannot call RPCs" - setupStatus is RIGHT HERE in this context`);
  lines.push(`  6. Source "${status.meta.sourceTable}" includes profile_fallback as valid`);
  lines.push(`  7. When user asks about Meta setup, cite the RAW setupStatus JSON above`);

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
