/**
 * CAMPAIGNS AND METRICS ONLY - NOT FOR CONNECTION STATUS
 *
 * CRITICAL: Meta connection and smart links status come from ai_get_setup_status RPC
 * This context only fetches campaigns, clicks, and performance metrics
 * DO NOT use meta.connected or tracking.smartLinksCount for connection decisions
 */

import { supabase } from '@/lib/supabase.client';

export interface SetupStatusInput {
  meta: {
    connected: boolean;
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
    pixels: Array<{
      id: string;
      name: string;
    }>;
  };
  smartLinks: {
    count: number;
    recent: Array<{
      id: string;
      title: string;
      slug: string;
      destinationUrl: string;
    }>;
  };
}

export interface ManagerContext {
  // Meta connection status (from RPC, DO NOT re-query)
  meta: {
    connected: boolean; // FROM SETUP STATUS RPC ONLY
    adAccounts: Array<{
      id: string;
      name: string;
      accountId: string;
      currency?: string;
    }>;
    campaigns: Array<{
      id: string;
      name: string;
      status: string;
      objective?: string;
      spend: number;
      impressions: number;
      clicks: number;
      ctr: number;
      cpc: number;
      conversions: number;
      createdAt: string;
    }>;
    insights: {
      spend7d: number;
      clicks7d: number;
      impressions7d: number;
      ctr7d: number;
      cpc7d: number;
    };
    lastSyncAt: string | null;
    errors: string[];
  };
  ghoste: {
    campaigns: Array<{
      id: string;
      name: string;
      status: string;
      type: string;
      createdAt: string;
    }>;
    drafts: number;
    rules: number;
    lastCreatedAt: string | null;
    errors: string[];
  };
  // Smart links tracking (FROM SETUP STATUS RPC ONLY for count/list)
  tracking: {
    clicks7d: number;
    clicks30d: number;
    smartLinksCount: number; // FROM SETUP STATUS RPC ONLY
    smartLinks: Array<{ id: string; title: string | null; slug: string; created_at: string }>;
    topLinks: Array<{ slug: string; clicks: number }>;
    topPlatforms: Array<{ platform: string; clicks: number }>;
    errors: string[];
  };
  summary: {
    totalSpend7d: number;
    totalClicks7d: number;
    avgCtr7d: number;
    avgCpc7d: number;
    activeCampaigns: number;
    topPerformer: string | null;
    opportunities: string[];
  };
}

/**
 * Get manager context using setupStatus as canonical source
 * CRITICAL: Pass setupStatus from ai_get_setup_status RPC to avoid contradictions
 */
export async function getManagerContext(userId: string, setupStatus?: SetupStatusInput): Promise<ManagerContext> {
  const context: ManagerContext = {
    meta: {
      connected: setupStatus?.meta.connected ?? false, // FROM RPC
      adAccounts: setupStatus?.meta.adAccounts ?? [],  // FROM RPC
      campaigns: [],
      insights: {
        spend7d: 0,
        clicks7d: 0,
        impressions7d: 0,
        ctr7d: 0,
        cpc7d: 0,
      },
      lastSyncAt: null,
      errors: [],
    },
    ghoste: {
      campaigns: [],
      drafts: 0,
      rules: 0,
      lastCreatedAt: null,
      errors: [],
    },
    tracking: {
      clicks7d: 0,
      clicks30d: 0,
      smartLinksCount: setupStatus?.smartLinks.count ?? 0, // FROM RPC
      smartLinks: setupStatus?.smartLinks.recent.map(l => ({
        id: l.id,
        title: l.title,
        slug: l.slug,
        created_at: '', // RPC doesn't need to provide this
      })) ?? [], // FROM RPC
      topLinks: [],
      topPlatforms: [],
      errors: [],
    },
    summary: {
      totalSpend7d: 0,
      totalClicks7d: 0,
      avgCtr7d: 0,
      avgCpc7d: 0,
      activeCampaigns: 0,
      topPerformer: null,
      opportunities: [],
    },
  };

  // Fetch campaign metrics and clicks only (NOT connection status)
  const results = await Promise.allSettled([
    fetchMetaCampaigns(userId, setupStatus?.meta.connected ?? false),
    fetchGhosteContext(userId),
    fetchTrackingClicks(userId),
  ]);

  // Merge results
  if (results[0].status === 'fulfilled') {
    Object.assign(context.meta, results[0].value);
  } else {
    context.meta.errors.push('Meta fetch failed');
  }

  if (results[1].status === 'fulfilled') {
    Object.assign(context.ghoste, results[1].value);
  } else {
    context.ghoste.errors.push('Ghoste fetch failed');
  }

  if (results[2].status === 'fulfilled') {
    Object.assign(context.tracking, results[2].value);
  } else {
    context.tracking.errors.push('Tracking fetch failed');
  }

  // Build summary
  context.summary = buildSummary(context);

  return context;
}

/**
 * Fetch Meta campaigns and metrics ONLY
 * Connection status comes from setupStatus parameter (from RPC)
 */
async function fetchMetaCampaigns(userId: string, isConnected: boolean) {
  const meta: ManagerContext['meta'] = {
    connected: isConnected, // FROM RPC, DO NOT RE-QUERY
    adAccounts: [], // FROM RPC, DO NOT RE-QUERY
    campaigns: [],
    insights: {
      spend7d: 0,
      clicks7d: 0,
      impressions7d: 0,
      ctr7d: 0,
      cpc7d: 0,
    },
    lastSyncAt: null,
    errors: [],
  };

  try {
    // ONLY fetch campaigns if connected (from RPC)
    if (!isConnected) {
      console.log('[fetchMetaCampaigns] Skipping - Meta not connected per RPC');
      return meta;
    }

    // Fetch campaigns ONLY (connection status already determined by RPC)
    const { data: campaigns, error: campaignsError } = await supabase
      .from('meta_ad_campaigns')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (campaignsError) {
      console.warn('[fetchMetaCampaigns] Campaigns fetch error:', campaignsError.message);
      meta.errors.push(`Campaigns fetch failed: ${campaignsError.message}`);
    }

    if (campaigns && campaigns.length > 0) {
      meta.campaigns = campaigns.map(c => {
        const spend = c.spend || 0;
        const impressions = c.impressions || 0;
        const clicks = c.clicks || 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;

        return {
          id: c.meta_campaign_id || c.id,
          name: c.name || 'Unnamed Campaign',
          status: c.status || 'UNKNOWN',
          objective: c.objective,
          spend,
          impressions,
          clicks,
          ctr,
          cpc,
          conversions: c.conversions || 0,
          createdAt: c.created_at,
        };
      });

      meta.lastSyncAt = campaigns[0]?.updated_at || campaigns[0]?.created_at;

      // Calculate insights
      meta.insights.spend7d = meta.campaigns.reduce((sum, c) => sum + c.spend, 0);
      meta.insights.clicks7d = meta.campaigns.reduce((sum, c) => sum + c.clicks, 0);
      meta.insights.impressions7d = meta.campaigns.reduce((sum, c) => sum + c.impressions, 0);

      if (meta.insights.impressions7d > 0) {
        meta.insights.ctr7d = (meta.insights.clicks7d / meta.insights.impressions7d) * 100;
      }
      if (meta.insights.clicks7d > 0) {
        meta.insights.cpc7d = meta.insights.spend7d / meta.insights.clicks7d;
      }

      console.log('[fetchMetaCampaigns] Loaded', meta.campaigns.length, 'campaigns');
    } else {
      console.log('[fetchMetaCampaigns] No campaigns found (but Meta is connected per RPC)');
    }
  } catch (error: any) {
    console.error('[fetchMetaCampaigns] Unexpected error:', error);
    meta.errors.push(`Campaigns fetch error: ${error.message}`);
  }

  return meta;
}

async function fetchGhosteContext(userId: string) {
  const ghoste: ManagerContext['ghoste'] = {
    campaigns: [],
    drafts: 0,
    rules: 0,
    lastCreatedAt: null,
    errors: [],
  };

  try {
    // Fetch internal Ghoste campaigns
    const { data: campaigns } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (campaigns && campaigns.length > 0) {
      ghoste.campaigns = campaigns.map(c => ({
        id: c.id,
        name: c.name || 'Unnamed Campaign',
        status: c.status || 'draft',
        type: c.campaign_type || 'standard',
        createdAt: c.created_at,
      }));

      ghoste.lastCreatedAt = campaigns[0].created_at;
      ghoste.drafts = campaigns.filter(c => c.status === 'draft').length;
    }

    // Fetch autopilot rules
    const { data: rules } = await supabase
      .from('ads_autopilot_rules')
      .select('id')
      .eq('user_id', userId)
      .eq('enabled', true);

    if (rules) {
      ghoste.rules = rules.length;
    }
  } catch (error: any) {
    ghoste.errors.push(`Ghoste error: ${error.message}`);
  }

  return ghoste;
}

/**
 * Fetch tracking clicks ONLY
 * Smart links count/list comes from setupStatus parameter (from RPC)
 */
async function fetchTrackingClicks(userId: string) {
  const tracking: ManagerContext['tracking'] = {
    clicks7d: 0,
    clicks30d: 0,
    smartLinksCount: 0, // FROM RPC, DO NOT RE-QUERY
    smartLinks: [], // FROM RPC, DO NOT RE-QUERY
    topLinks: [],
    topPlatforms: [],
    errors: [],
  };

  try {
    // ONLY fetch click metrics, NOT smart links list/count
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch 7-day clicks
    const { data: events7d } = await supabase
      .from('smartlink_events')
      .select('event_type, platform, link_id')
      .eq('user_id', userId)
      .eq('event_type', 'click')
      .gte('created_at', sevenDaysAgo.toISOString());

    if (events7d) {
      tracking.clicks7d = events7d.length;

      // Count by platform
      const platformCounts: Record<string, number> = {};
      const linkCounts: Record<string, number> = {};

      events7d.forEach(e => {
        if (e.platform) {
          platformCounts[e.platform] = (platformCounts[e.platform] || 0) + 1;
        }
        if (e.link_id) {
          linkCounts[e.link_id] = (linkCounts[e.link_id] || 0) + 1;
        }
      });

      tracking.topPlatforms = Object.entries(platformCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([platform, clicks]) => ({ platform, clicks }));

      // Get link slugs for top links
      const topLinkIds = Object.entries(linkCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

      for (const [linkId, clicks] of topLinkIds) {
        const { data: link } = await supabase
          .from('smart_links')
          .select('slug')
          .eq('id', linkId)
          .maybeSingle();

        if (link) {
          tracking.topLinks.push({ slug: link.slug, clicks });
        }
      }
    }

    // Fetch 30-day clicks (count only)
    const { count } = await supabase
      .from('smartlink_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', 'click')
      .gte('created_at', thirtyDaysAgo.toISOString());

    tracking.clicks30d = count || 0;

    console.log('[fetchTrackingClicks] Clicks:', {
      clicks7d: tracking.clicks7d,
      clicks30d: tracking.clicks30d,
      topLinks: tracking.topLinks.length,
    });
  } catch (error: any) {
    console.error('[fetchTrackingClicks] Error:', error);
    tracking.errors.push(`Tracking error: ${error.message}`);
  }

  return tracking;
}

function buildSummary(context: ManagerContext): ManagerContext['summary'] {
  const summary: ManagerContext['summary'] = {
    totalSpend7d: 0,
    totalClicks7d: 0,
    avgCtr7d: 0,
    avgCpc7d: 0,
    activeCampaigns: 0,
    topPerformer: null,
    opportunities: [],
  };

  // Meta insights
  summary.totalSpend7d = context.meta.insights.spend7d;
  summary.totalClicks7d = context.meta.insights.clicks7d + context.tracking.clicks7d;
  summary.avgCtr7d = context.meta.insights.ctr7d;
  summary.avgCpc7d = context.meta.insights.cpc7d;
  summary.activeCampaigns = context.meta.campaigns.filter(c => c.status === 'ACTIVE').length;

  // Find top performer
  const sorted = [...context.meta.campaigns]
    .filter(c => c.impressions > 500)
    .sort((a, b) => b.ctr - a.ctr);

  if (sorted.length > 0) {
    summary.topPerformer = sorted[0].name;
  }

  // Generate opportunities
  if (!context.meta.connected) {
    summary.opportunities.push('Connect Meta Ads to track campaign performance');
  } else if (context.meta.campaigns.length === 0) {
    summary.opportunities.push('Launch your first Meta ad campaign');
  }

  if (context.tracking.smartLinksCount === 0) {
    summary.opportunities.push('Create your first smart link to track your music');
  } else if (context.tracking.topLinks.length > 0 && context.meta.campaigns.length > 0) {
    summary.opportunities.push(`Promote top SmartLink "${context.tracking.topLinks[0].slug}" with ads`);
  }

  const underperformers = context.meta.campaigns.filter(
    c => c.status === 'ACTIVE' && c.impressions > 500 && c.ctr < 0.5
  );
  if (underperformers.length > 0) {
    summary.opportunities.push(`${underperformers.length} campaigns need creative refresh`);
  }

  return summary;
}

export function formatManagerContextForAI(context: ManagerContext): string {
  const sections: string[] = [];

  sections.push('=== META ADS STATUS ===');
  if (context.meta.connected) {
    sections.push(`✅ Connected: YES`);
    sections.push(`📊 Ad Accounts: ${context.meta.adAccounts.length} detected`);

    if (context.meta.adAccounts.length > 0) {
      sections.push(`   Accounts: ${context.meta.adAccounts.map(a => a.name).join(', ')}`);
    }

    if (context.meta.campaigns.length > 0) {
      sections.push(`\n📢 Campaigns (${context.meta.campaigns.length} total):`);
      context.meta.campaigns.slice(0, 10).forEach(c => {
        sections.push(
          `   - "${c.name}" (${c.status}): $${c.spend.toFixed(2)} spent, ${c.clicks} clicks, ${c.ctr.toFixed(2)}% CTR, $${c.cpc.toFixed(2)} CPC`
        );
      });

      sections.push(`\n💰 7-Day Totals: $${context.meta.insights.spend7d.toFixed(2)} spend, ${context.meta.insights.clicks7d} clicks, ${context.meta.insights.ctr7d.toFixed(2)}% CTR`);
    } else {
      sections.push('\n📢 No campaigns found yet. Ready to create first campaign.');
    }

    if (context.meta.errors.length > 0) {
      sections.push(`\n⚠️ Warnings: ${context.meta.errors.join('; ')}`);
    }
  } else {
    sections.push('❌ Connected: NO');
    sections.push('ℹ️ User needs to connect Meta Ads in Profile → Connected Accounts.');
  }

  sections.push('\n=== GHOSTE ADS (Internal) ===');
  sections.push(`${context.ghoste.campaigns.length} campaigns created in Ghoste`);
  sections.push(`${context.ghoste.drafts} drafts pending`);
  sections.push(`${context.ghoste.rules} autopilot rules active`);

  sections.push('\n=== SMART LINKS ===');
  sections.push(`🔗 Total smart links: ${context.tracking.smartLinksCount}`);
  if (context.tracking.smartLinks.length > 0) {
    sections.push(`\n📎 Recent links (promote these with ads):`);
    context.tracking.smartLinks.forEach(link => {
      sections.push(`   - "${link.title || 'Untitled'}" → ghoste.one/s/${link.slug}`);
    });
  } else if (context.tracking.smartLinksCount === 0) {
    sections.push('ℹ️ No smart links yet. User should create a smart link to promote with ads.');
    sections.push('ℹ️ Suggest: "Create a smart link for your track so we can promote it."');
  }

  sections.push('\n=== LINK CLICKS & TRACKING ===');
  sections.push(`${context.tracking.clicks7d} clicks (7d), ${context.tracking.clicks30d} clicks (30d)`);
  if (context.tracking.topLinks.length > 0) {
    sections.push(`Top performing links: ${context.tracking.topLinks.map(l => `${l.slug} (${l.clicks})`).join(', ')}`);
  }
  if (context.tracking.topPlatforms.length > 0) {
    sections.push(`Top platforms: ${context.tracking.topPlatforms.map(p => `${p.platform} (${p.clicks})`).join(', ')}`);
  }

  sections.push('\n=== SUMMARY ===');
  sections.push(`Total spend (7d): $${context.summary.totalSpend7d.toFixed(2)}`);
  sections.push(`Total clicks (7d): ${context.summary.totalClicks7d}`);
  sections.push(`Active campaigns: ${context.summary.activeCampaigns}`);
  if (context.summary.topPerformer) {
    sections.push(`Top performer: ${context.summary.topPerformer}`);
  }

  if (context.summary.opportunities.length > 0) {
    sections.push(`\nOpportunities:`);
    context.summary.opportunities.forEach(o => sections.push(`- ${o}`));
  }

  return sections.join('\n');
}
