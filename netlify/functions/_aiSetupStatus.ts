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
    }>;
    pages: Array<{
      id: string;
      name: string;
      category?: string;
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
  errors: string[];
}

/**
 * Get Supabase admin client (service role)
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
 * Transform RPC response to client-facing format
 */
function transformRPCResponse(rpcData: RPCSetupStatus): Omit<AISetupStatus, 'errors'> {
  return {
    meta: {
      connected: rpcData.meta.has_meta,
      sourceTable: rpcData.meta.source_table,
      adAccounts: rpcData.meta.ad_accounts.map(acc => ({
        id: acc.id,
        name: acc.name,
        accountId: acc.account_id,
        currency: acc.currency,
      })),
      pages: rpcData.meta.pages.map(page => ({
        id: page.id,
        name: page.name,
        category: page.category,
      })),
      instagramAccounts: rpcData.meta.instagram_accounts.map(ig => ({
        id: ig.id,
        username: ig.username,
        profilePictureUrl: ig.profile_picture_url,
      })),
      pixels: rpcData.meta.pixels.map(px => ({
        id: px.id,
        name: px.name,
        isAvailable: px.is_available,
      })),
    },
    smartLinks: {
      count: rpcData.smart_links_count,
      recent: rpcData.smart_links_preview.map(link => ({
        id: link.id,
        title: link.title,
        slug: link.slug,
        destinationUrl: link.destination_url,
        createdAt: link.created_at,
      })),
    },
  };
}

/**
 * Call the canonical RPC function
 * This is the SINGLE SOURCE OF TRUTH for AI setup status
 */
async function callSetupStatusRPC(supabase: SupabaseClient, userId: string): Promise<RPCSetupStatus> {
  console.log('[callSetupStatusRPC] Calling ai_get_setup_status RPC for user:', userId);

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
  });

  return data as RPCSetupStatus;
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

  // Meta status
  lines.push('Meta Connection:');
  if (status.meta.connected) {
    lines.push(`  ✅ CONNECTED (source: ${status.meta.sourceTable || 'unknown'})`);

    if (status.meta.adAccounts.length > 0) {
      lines.push(`  Ad Accounts: ${status.meta.adAccounts.length}`);
      status.meta.adAccounts.slice(0, 3).forEach(acc => {
        lines.push(`    - ${acc.name} (${acc.accountId}${acc.currency ? ', ' + acc.currency : ''})`);
      });
      if (status.meta.adAccounts.length > 3) {
        lines.push(`    ... and ${status.meta.adAccounts.length - 3} more`);
      }
    } else {
      lines.push('  ⚠️  Connected but no ad accounts found');
    }

    if (status.meta.pages.length > 0) {
      lines.push(`  Facebook Pages: ${status.meta.pages.length}`);
      status.meta.pages.slice(0, 2).forEach(page => {
        lines.push(`    - ${page.name}`);
      });
    }

    if (status.meta.instagramAccounts.length > 0) {
      lines.push(`  Instagram Accounts: ${status.meta.instagramAccounts.length}`);
      status.meta.instagramAccounts.slice(0, 2).forEach(ig => {
        lines.push(`    - @${ig.username}`);
      });
    }

    if (status.meta.pixels.length > 0) {
      lines.push(`  Pixels: ${status.meta.pixels.length}`);
      status.meta.pixels.slice(0, 2).forEach(px => {
        lines.push(`    - ${px.name} (${px.id})`);
      });
    }
  } else {
    lines.push('  ❌ NOT CONNECTED');
    lines.push('  → User must connect Meta in Profile → Connected Accounts');
    lines.push('  → DO NOT create ads or campaigns until Meta is connected');
  }

  lines.push('');

  // Smart Links status
  lines.push('Smart Links:');
  if (status.smartLinks.count > 0) {
    lines.push(`  ✅ ${status.smartLinks.count} smart link${status.smartLinks.count === 1 ? '' : 's'} available`);
    if (status.smartLinks.recent.length > 0) {
      lines.push('  Recent links (use these for ad destinations):');
      status.smartLinks.recent.forEach(link => {
        const dest = link.destinationUrl ? ` → ${link.destinationUrl}` : '';
        lines.push(`    - "${link.title}" (ghoste.one/s/${link.slug})${dest}`);
      });
    }
  } else {
    lines.push('  ❌ NO SMART LINKS');
    lines.push('  → User must create a smart link before running ads');
    lines.push('  → Cannot create ads without a destination URL');
  }

  lines.push('');

  // Critical AI rules
  lines.push('CRITICAL AI RULES:');
  lines.push(`  1. Meta connected = ${status.meta.connected} (DO NOT contradict this)`);
  lines.push(`  2. Smart links count = ${status.smartLinks.count} (DO NOT say "no links" if count > 0)`);
  lines.push('  3. If RPC data says connected=true, NEVER claim "not connected"');
  lines.push('  4. If user asks to create ads and connected=false, guide to Profile → Connected Accounts');
  lines.push('  5. If user asks to create ads and smart_links_count=0, guide to create smart link first');

  // Errors
  if (status.errors.length > 0) {
    lines.push('');
    lines.push('⚠️  RPC Errors:');
    status.errors.forEach(err => lines.push(`  - ${err}`));
  }

  lines.push('');
  lines.push('=== END CANONICAL SETUP STATUS ===');

  return lines.join('\n');
}
