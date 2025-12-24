import { supabase } from '../../lib/supabase';

export interface OperatorContext {
  userId: string;
  timestamp: string;

  // Ghoste analytics
  smartlinks: {
    totalClicks: number;
    clicksByDay: Record<string, number>;
    clicksByPlatform: Record<string, number>;
    topLinks: Array<{
      id: string;
      slug: string;
      clicks: number;
      conversionRate?: number;
    }>;
  };

  // Meta ads performance (if connected)
  meta: {
    connected: boolean;
    campaigns?: Array<{
      id: string;
      name: string;
      status: string;
      objective: string;
      budget: number;
      spend: number;
      impressions: number;
      clicks: number;
      ctr: number;
      cpc: number;
      cpm: number;
      conversions: number;
      createdAt: string;
      lastUpdated: string;
    }>;
    adsets?: Array<{
      id: string;
      campaignId: string;
      name: string;
      status: string;
      budget: number;
      spend: number;
      impressions: number;
      clicks: number;
      ctr: number;
      cpc: number;
    }>;
    ads?: Array<{
      id: string;
      adsetId: string;
      name: string;
      status: string;
      spend: number;
      impressions: number;
      clicks: number;
      ctr: number;
      cpc: number;
      creative?: {
        type: string;
        title?: string;
        body?: string;
        imageUrl?: string;
      };
    }>;
    pixelTracking?: {
      configured: boolean;
      recentEvents: number;
      conversionEvents: string[];
    };
  };

  // User constraints
  user: {
    plan: string;
    creditsRemaining: number;
    goals?: string[];
    brandVoice?: string;
  };

  // Operator settings
  operator: {
    mode: 'suggest_only' | 'auto_safe' | 'auto_full';
    enabled: boolean;
    dailySpendCapCents: number;
    maxBudgetChangePct: number;
    minImpressionsForKill: number;
    cooldownHours: number;
  };

  // Recent actions (to avoid repeating)
  recentActions: Array<{
    id: string;
    category: string;
    title: string;
    status: string;
    createdAt: string;
    payload: any;
  }>;
}

export async function getOperatorContext(userId: string): Promise<OperatorContext> {
  const context: OperatorContext = {
    userId,
    timestamp: new Date().toISOString(),
    smartlinks: {
      totalClicks: 0,
      clicksByDay: {},
      clicksByPlatform: {},
      topLinks: [],
    },
    meta: {
      connected: false,
    },
    user: {
      plan: 'operator',
      creditsRemaining: 0,
    },
    operator: {
      mode: 'suggest_only',
      enabled: false,
      dailySpendCapCents: 5000,
      maxBudgetChangePct: 20,
      minImpressionsForKill: 1000,
      cooldownHours: 12,
    },
    recentActions: [],
  };

  try {
    // 1. Get Ghoste analytics (smartlink clicks)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: smartlinkEvents } = await supabase
      .from('smartlink_events')
      .select('event_type, platform, created_at, link_id')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (smartlinkEvents) {
      context.smartlinks.totalClicks = smartlinkEvents.filter(e => e.event_type === 'click').length;

      // Group by day
      smartlinkEvents.forEach(event => {
        const day = event.created_at.split('T')[0];
        context.smartlinks.clicksByDay[day] = (context.smartlinks.clicksByDay[day] || 0) + 1;
      });

      // Group by platform
      smartlinkEvents.forEach(event => {
        if (event.platform) {
          context.smartlinks.clicksByPlatform[event.platform] =
            (context.smartlinks.clicksByPlatform[event.platform] || 0) + 1;
        }
      });

      // Get top links
      const linkCounts: Record<string, number> = {};
      smartlinkEvents.forEach(event => {
        if (event.link_id) {
          linkCounts[event.link_id] = (linkCounts[event.link_id] || 0) + 1;
        }
      });

      const sortedLinks = Object.entries(linkCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

      for (const [linkId, clicks] of sortedLinks) {
        const { data: link } = await supabase
          .from('smart_links')
          .select('id, slug')
          .eq('id', linkId)
          .maybeSingle();

        if (link) {
          context.smartlinks.topLinks.push({
            id: link.id,
            slug: link.slug,
            clicks,
          });
        }
      }
    }

    // 2. Get ALL ads performance (Meta + Ghoste unified)
    const { data: allCampaigns } = await supabase
      .from('ai_ads_unified')
      .select('*')
      .eq('user_id', userId)
      .order('last_updated', { ascending: false })
      .limit(50);

    if (allCampaigns && allCampaigns.length > 0) {
      // Mark as connected if any campaigns exist
      context.meta.connected = true;

      // Map unified campaigns to context format
      context.meta.campaigns = allCampaigns.map(c => ({
        id: c.campaign_id,
        name: c.campaign_name || 'Unnamed Campaign',
        status: c.status || 'UNKNOWN',
        objective: c.objective || '',
        budget: c.daily_budget || 0,
        spend: parseFloat(c.spend?.toString() || '0'),
        impressions: parseInt(c.impressions?.toString() || '0'),
        clicks: parseInt(c.clicks?.toString() || '0'),
        ctr: parseFloat(c.ctr?.toString() || '0'),
        cpc: parseFloat(c.cpc?.toString() || '0'),
        cpm: c.impressions > 0 ? (parseFloat(c.spend?.toString() || '0') / c.impressions) * 1000 : 0,
        conversions: parseInt(c.conversions?.toString() || '0'),
        createdAt: c.created_at,
        lastUpdated: c.last_updated || c.created_at,
      }));
    } else {
      // Check if Meta credentials exist (even without campaigns)
      const { data: metaCreds } = await supabase
        .from('meta_credentials')
        .select('pixel_id, capi_token')
        .eq('user_id', userId)
        .maybeSingle();

      if (metaCreds) {
        context.meta.connected = true;
        context.meta.campaigns = [];
      }
    }

    // Check pixel tracking (for Meta users)
    const { data: pixelConfig } = await supabase
      .from('meta_credentials')
      .select('pixel_id, capi_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (pixelConfig) {
      context.meta.pixelTracking = {
        configured: !!(pixelConfig.pixel_id && pixelConfig.capi_token),
        recentEvents: 0,
        conversionEvents: [],
      };
    }

    // 3. Get user wallet/plan
    const { data: wallet } = await supabase
      .from('user_wallets')
      .select('plan, credits_remaining')
      .eq('user_id', userId)
      .maybeSingle();

    if (wallet) {
      context.user.plan = wallet.plan || 'operator';
      context.user.creditsRemaining = wallet.credits_remaining || 0;
    }

    // Get user profile goals
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('goals, artist_name')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      context.user.goals = profile.goals || [];
      context.user.brandVoice = profile.artist_name || 'Artist';
    }

    // 4. Get operator settings
    const { data: operatorSettings } = await supabase
      .from('ai_operator_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (operatorSettings) {
      context.operator = {
        mode: operatorSettings.mode || 'suggest_only',
        enabled: operatorSettings.enabled || false,
        dailySpendCapCents: operatorSettings.daily_spend_cap_cents || 5000,
        maxBudgetChangePct: operatorSettings.max_budget_change_pct || 20,
        minImpressionsForKill: operatorSettings.min_impressions_for_kill || 1000,
        cooldownHours: operatorSettings.cooldown_hours || 12,
      };
    }

    // 5. Get recent actions (last 50)
    const { data: recentActions } = await supabase
      .from('ai_operator_actions')
      .select('id, category, title, status, created_at, payload')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (recentActions) {
      context.recentActions = recentActions;
    }

  } catch (error) {
    console.error('[OperatorContext] Error building context:', error);
  }

  return context;
}
