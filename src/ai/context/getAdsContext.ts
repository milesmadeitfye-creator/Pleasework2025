// SERVER-SAFE: This file is bundled by Netlify Functions - uses process.env, no @ alias
import { supabaseServer } from '../../lib/supabase.server';

export interface AdsContext {
  meta: {
    connected: boolean;
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
      dailyBudget?: number;
      spend?: number;
      impressions?: number;
      clicks?: number;
      ctr?: number;
      cpc?: number;
      conversions?: number;
      createdAt?: string;
    }>;
    adsets: Array<{
      id: string;
      campaignId: string;
      name: string;
      status: string;
      spend?: number;
      impressions?: number;
      clicks?: number;
    }>;
    ads: Array<{
      id: string;
      adsetId: string;
      name: string;
      status: string;
      spend?: number;
      impressions?: number;
      clicks?: number;
      ctr?: number;
      creative?: any;
    }>;
    creatives: Array<{
      id: string;
      type: string;
      title?: string;
      body?: string;
      imageUrl?: string;
    }>;
    insights: {
      byDay: Array<{ date: string; spend: number; clicks: number; impressions: number }>;
      byCampaign: Record<string, { spend: number; clicks: number; ctr: number }>;
      byAdset: Record<string, { spend: number; clicks: number }>;
      byAd: Record<string, { spend: number; clicks: number; ctr: number }>;
    };
    lastSyncAt: string | null;
    errors: string[];
  };
  ghoste: {
    adsCreatedInGhoste: Array<{
      id: string;
      name: string;
      status: string;
      type: string;
      createdAt: string;
    }>;
    drafts: Array<{
      id: string;
      name: string;
      status: string;
    }>;
    rules: Array<{
      id: string;
      name: string;
      enabled: boolean;
    }>;
    lastCreatedAt: string | null;
    errors: string[];
  };
  performance: {
    smartlinkClicksByDay: Array<{ date: string; clicks: number; platform?: string }>;
    smartlinkTopLinks: Array<{ slug: string; clicks: number; conversions?: number }>;
    conversionsProxy: Array<{ date: string; conversions: number; source: string }>;
    attributionNotes: string[];
  };
  summary: {
    spend7d: number;
    clicks7d: number;
    ctr7d: number;
    cpc7d: number;
    topWinners: Array<{ id: string; name: string; ctr: number; cpc: number }>;
    topLosers: Array<{ id: string; name: string; ctr: number; cpc: number }>;
    opportunities: string[];
  };
}

export async function getAdsContext(userId: string): Promise<AdsContext> {
  const context: AdsContext = {
    meta: {
      connected: false,
      adAccounts: [],
      campaigns: [],
      adsets: [],
      ads: [],
      creatives: [],
      insights: {
        byDay: [],
        byCampaign: {},
        byAdset: {},
        byAd: {},
      },
      lastSyncAt: null,
      errors: [],
    },
    ghoste: {
      adsCreatedInGhoste: [],
      drafts: [],
      rules: [],
      lastCreatedAt: null,
      errors: [],
    },
    performance: {
      smartlinkClicksByDay: [],
      smartlinkTopLinks: [],
      conversionsProxy: [],
      attributionNotes: [],
    },
    summary: {
      spend7d: 0,
      clicks7d: 0,
      ctr7d: 0,
      cpc7d: 0,
      topWinners: [],
      topLosers: [],
      opportunities: [],
    },
  };

  // Use Promise.allSettled to never block on any single source
  const results = await Promise.allSettled([
    fetchMetaData(userId),
    fetchGhosteAds(userId),
    fetchPerformanceData(userId),
  ]);

  // Merge results (non-blocking)
  if (results[0].status === 'fulfilled') {
    Object.assign(context.meta, results[0].value);
  } else {
    context.meta.errors.push(`Meta fetch failed: ${results[0].reason?.message || 'Unknown'}`);
  }

  if (results[1].status === 'fulfilled') {
    Object.assign(context.ghoste, results[1].value);
  } else {
    context.ghoste.errors.push(`Ghoste ads fetch failed: ${results[1].reason?.message || 'Unknown'}`);
  }

  if (results[2].status === 'fulfilled') {
    Object.assign(context.performance, results[2].value);
  }

  // Build summary
  context.summary = buildSummary(context);

  return context;
}

async function fetchMetaData(userId: string) {
  const meta: AdsContext['meta'] = {
    connected: false,
    adAccounts: [],
    campaigns: [],
    adsets: [],
    ads: [],
    creatives: [],
    insights: { byDay: [], byCampaign: {}, byAdset: {}, byAd: {} },
    lastSyncAt: null,
    errors: [],
  };

  try {
    // Check credentials
    const { data: creds, error: credsError } = await supabaseServer
      .from('meta_credentials')
      .select('access_token, expires_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (credsError) {
      meta.errors.push(`Credentials check failed: ${credsError.message}`);
      return meta;
    }

    if (!creds || !creds.access_token) {
      meta.errors.push('No Meta access token found');
      return meta;
    }

    // Token exists - set connected to true
    meta.connected = true;

    // Check if token expired
    if (creds.expires_at) {
      const expiresAt = new Date(creds.expires_at);
      if (expiresAt < new Date()) {
        meta.errors.push('Access token expired - please reconnect Meta');
      }
    }

    // Fetch ad accounts
    const { data: adAccounts } = await supabaseServer
      .from('meta_ad_accounts')
      .select('*')
      .eq('user_id', userId);

    if (adAccounts && adAccounts.length > 0) {
      meta.adAccounts = adAccounts.map(acc => ({
        id: acc.id,
        name: acc.name || 'Unnamed Account',
        accountId: acc.ad_account_id || acc.account_id || acc.id,
        currency: acc.currency,
      }));
    }

    // Fetch campaigns
    const { data: campaigns } = await supabaseServer
      .from('meta_ad_campaigns')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (campaigns && campaigns.length > 0) {
      meta.campaigns = campaigns.map(c => ({
        id: c.meta_campaign_id || c.id,
        name: c.name || 'Unnamed Campaign',
        status: c.status || 'UNKNOWN',
        objective: c.objective,
        dailyBudget: c.daily_budget_cents || c.budget,
        spend: c.spend || 0,
        impressions: c.impressions || 0,
        clicks: c.clicks || 0,
        ctr: c.impressions > 0 ? ((c.clicks || 0) / c.impressions) * 100 : 0,
        cpc: c.clicks > 0 ? (c.spend || 0) / c.clicks : 0,
        conversions: c.conversions || 0,
        createdAt: c.created_at,
      }));

      meta.lastSyncAt = campaigns[0]?.updated_at || campaigns[0]?.created_at;
    }

    // Fetch assets/creatives
    const { data: assets } = await supabaseServer
      .from('user_meta_assets')
      .select('*')
      .eq('user_id', userId)
      .limit(20);

    if (assets && assets.length > 0) {
      meta.creatives = assets.map(a => ({
        id: a.id,
        type: a.asset_type || 'unknown',
        title: a.name || a.title,
        body: a.description,
        imageUrl: a.url || a.image_url,
      }));
    }

    // Build insights summary
    if (meta.campaigns.length > 0) {
      // Group by day (last 7 days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      });

      meta.insights.byDay = last7Days.map(date => ({
        date,
        spend: 0,
        clicks: 0,
        impressions: 0,
      }));

      // Aggregate by campaign
      meta.campaigns.forEach(campaign => {
        meta.insights.byCampaign[campaign.id] = {
          spend: campaign.spend || 0,
          clicks: campaign.clicks || 0,
          ctr: campaign.ctr || 0,
        };
      });
    }

    if (meta.campaigns.length === 0 && meta.adAccounts.length === 0) {
      meta.errors.push('Meta connected but no ad accounts or campaigns found yet');
    }
  } catch (error: any) {
    meta.errors.push(`Meta data fetch error: ${error.message}`);
  }

  return meta;
}

async function fetchGhosteAds(userId: string) {
  const ghoste: AdsContext['ghoste'] = {
    adsCreatedInGhoste: [],
    drafts: [],
    rules: [],
    lastCreatedAt: null,
    errors: [],
  };

  try {
    // Fetch Ghoste internal ad campaigns
    const { data: campaigns } = await supabaseServer
      .from('ad_campaigns')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (campaigns && campaigns.length > 0) {
      ghoste.adsCreatedInGhoste = campaigns.map(c => ({
        id: c.id,
        name: c.name || 'Unnamed Campaign',
        status: c.status || 'draft',
        type: c.campaign_type || 'standard',
        createdAt: c.created_at,
      }));

      ghoste.lastCreatedAt = campaigns[0].created_at;

      // Separate drafts
      ghoste.drafts = ghoste.adsCreatedInGhoste.filter(c => c.status === 'draft');
    }

    // Fetch autopilot rules
    const { data: rules } = await supabaseServer
      .from('ads_autopilot_rules')
      .select('*')
      .eq('user_id', userId);

    if (rules && rules.length > 0) {
      ghoste.rules = rules.map(r => ({
        id: r.id,
        name: r.name || r.rule_name || 'Unnamed Rule',
        enabled: r.enabled || false,
      }));
    }
  } catch (error: any) {
    ghoste.errors.push(`Ghoste ads fetch error: ${error.message}`);
  }

  return ghoste;
}

async function fetchPerformanceData(userId: string) {
  const performance: AdsContext['performance'] = {
    smartlinkClicksByDay: [],
    smartlinkTopLinks: [],
    conversionsProxy: [],
    attributionNotes: [],
  };

  try {
    // Fetch last 7 days of smartlink clicks
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: events } = await supabaseServer
      .from('smartlink_events')
      .select('event_type, platform, created_at, link_id')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (events && events.length > 0) {
      // Group by day
      const clicksByDay: Record<string, { clicks: number; platform?: string }> = {};

      events.forEach(e => {
        if (e.event_type === 'click') {
          const day = e.created_at.split('T')[0];
          if (!clicksByDay[day]) {
            clicksByDay[day] = { clicks: 0 };
          }
          clicksByDay[day].clicks++;
        }
      });

      performance.smartlinkClicksByDay = Object.entries(clicksByDay).map(([date, data]) => ({
        date,
        clicks: data.clicks,
      }));

      // Top links by click count
      const linkCounts: Record<string, number> = {};
      events.forEach(e => {
        if (e.event_type === 'click' && e.link_id) {
          linkCounts[e.link_id] = (linkCounts[e.link_id] || 0) + 1;
        }
      });

      const sortedLinks = Object.entries(linkCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

      for (const [linkId, clicks] of sortedLinks) {
        const { data: link } = await supabaseServer
          .from('smart_links')
          .select('slug')
          .eq('id', linkId)
          .maybeSingle();

        if (link) {
          performance.smartlinkTopLinks.push({
            slug: link.slug,
            clicks,
          });
        }
      }

      // Add attribution note
      performance.attributionNotes.push(
        `SmartLink data available for last 7 days. ${events.length} total events tracked.`
      );
    }
  } catch (error: any) {
    console.error('[getAdsContext] Performance fetch error:', error);
  }

  return performance;
}

function buildSummary(context: AdsContext): AdsContext['summary'] {
  const summary: AdsContext['summary'] = {
    spend7d: 0,
    clicks7d: 0,
    ctr7d: 0,
    cpc7d: 0,
    topWinners: [],
    topLosers: [],
    opportunities: [],
  };

  // Aggregate Meta spend and clicks (last 7 days)
  context.meta.campaigns.forEach(campaign => {
    summary.spend7d += campaign.spend || 0;
    summary.clicks7d += campaign.clicks || 0;
  });

  // Calculate averages
  const totalImpressions = context.meta.campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
  if (totalImpressions > 0) {
    summary.ctr7d = (summary.clicks7d / totalImpressions) * 100;
  }
  if (summary.clicks7d > 0) {
    summary.cpc7d = summary.spend7d / summary.clicks7d;
  }

  // Add smartlink clicks
  summary.clicks7d += context.performance.smartlinkClicksByDay.reduce((sum, d) => sum + d.clicks, 0);

  // Find winners (high CTR, low CPC)
  const activeCampaigns = context.meta.campaigns.filter(
    c => c.status === 'ACTIVE' && (c.impressions || 0) > 500
  );

  summary.topWinners = activeCampaigns
    .filter(c => (c.ctr || 0) > 1.0 && (c.cpc || 0) < 1.5)
    .sort((a, b) => (b.ctr || 0) - (a.ctr || 0))
    .slice(0, 3)
    .map(c => ({
      id: c.id,
      name: c.name,
      ctr: c.ctr || 0,
      cpc: c.cpc || 0,
    }));

  // Find losers (low CTR, high CPC)
  summary.topLosers = activeCampaigns
    .filter(c => (c.ctr || 0) < 0.5 || (c.cpc || 0) > 2.0)
    .sort((a, b) => (a.ctr || 0) - (b.ctr || 0))
    .slice(0, 3)
    .map(c => ({
      id: c.id,
      name: c.name,
      ctr: c.ctr || 0,
      cpc: c.cpc || 0,
    }));

  // Generate opportunities
  if (!context.meta.connected) {
    summary.opportunities.push('Connect Meta Ads to unlock advanced optimization');
  } else if (context.meta.campaigns.length === 0) {
    summary.opportunities.push('Launch your first Meta ad campaign to drive traffic');
  }

  if (context.performance.smartlinkTopLinks.length > 0 && context.meta.campaigns.length > 0) {
    summary.opportunities.push('Amplify top-performing SmartLinks with targeted ads');
  }

  if (summary.topLosers.length > 0) {
    summary.opportunities.push(`${summary.topLosers.length} campaigns need creative refresh or optimization`);
  }

  return summary;
}
