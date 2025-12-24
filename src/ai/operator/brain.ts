import type { OperatorContext } from './context';

export interface Insight {
  id: string;
  type: 'warning' | 'opportunity' | 'success' | 'info';
  title: string;
  description: string;
  metric?: string;
  value?: number;
  change?: number;
  data?: any;
}

export interface ProposedAction {
  category: 'budget' | 'pause' | 'duplicate' | 'creative' | 'campaign' | 'tracking' | 'audience';
  title: string;
  reasoning: string;
  payload: any;
  safetyChecks: {
    withinBudgetCap: boolean;
    withinChangePct: boolean;
    meetsMinImpressions: boolean;
    outsideCooldown: boolean;
    estimatedImpact: string;
    riskLevel: 'low' | 'medium' | 'high';
  };
  priority: number;
}

export function analyzePerformance(context: OperatorContext): Insight[] {
  const insights: Insight[] = [];

  // Analyze smartlink performance
  if (context.smartlinks.totalClicks > 0) {
    const avgClicksPerDay = context.smartlinks.totalClicks / 30;

    if (avgClicksPerDay > 100) {
      insights.push({
        id: `sl-success-${Date.now()}`,
        type: 'success',
        title: 'Strong Smart Link Performance',
        description: `Your smart links are averaging ${Math.round(avgClicksPerDay)} clicks per day. Consider amplifying reach with paid ads.`,
        metric: 'avg_daily_clicks',
        value: avgClicksPerDay,
      });
    } else if (avgClicksPerDay < 10) {
      insights.push({
        id: `sl-warning-${Date.now()}`,
        type: 'warning',
        title: 'Low Smart Link Traffic',
        description: 'Your smart links need more visibility. Consider launching a Meta ad campaign to drive traffic.',
        metric: 'avg_daily_clicks',
        value: avgClicksPerDay,
      });
    }

    // Platform diversity
    const platforms = Object.keys(context.smartlinks.clicksByPlatform);
    if (platforms.length === 1) {
      insights.push({
        id: `sl-opportunity-${Date.now()}`,
        type: 'opportunity',
        title: 'Single Platform Dependency',
        description: `${platforms[0]} accounts for all your traffic. Diversifying ad placements could reach new audiences.`,
      });
    }
  }

  // Analyze Meta campaign performance
  if (context.meta.connected && context.meta.campaigns) {
    for (const campaign of context.meta.campaigns) {
      if (campaign.status !== 'ACTIVE') continue;

      // Low CTR warning
      if (campaign.impressions > context.operator.minImpressionsForKill && campaign.ctr < 0.7) {
        insights.push({
          id: `meta-low-ctr-${campaign.id}`,
          type: 'warning',
          title: `Low CTR: ${campaign.name}`,
          description: `CTR is ${campaign.ctr.toFixed(2)}% after ${campaign.impressions.toLocaleString()} impressions. Creative may need refreshing.`,
          metric: 'ctr',
          value: campaign.ctr,
          data: { campaignId: campaign.id, campaignName: campaign.name },
        });
      }

      // High CPC warning
      if (campaign.clicks > 50 && campaign.cpc > 2.0) {
        insights.push({
          id: `meta-high-cpc-${campaign.id}`,
          type: 'warning',
          title: `High CPC: ${campaign.name}`,
          description: `Paying $${campaign.cpc.toFixed(2)} per click. Consider audience refinement or creative testing.`,
          metric: 'cpc',
          value: campaign.cpc,
          data: { campaignId: campaign.id, campaignName: campaign.name },
        });
      }

      // Winner detected
      if (campaign.ctr > 1.5 && campaign.cpc < 1.0 && campaign.clicks > 100) {
        insights.push({
          id: `meta-winner-${campaign.id}`,
          type: 'success',
          title: `Winner Found: ${campaign.name}`,
          description: `Strong ${campaign.ctr.toFixed(2)}% CTR and low $${campaign.cpc.toFixed(2)} CPC. Consider scaling this campaign.`,
          metric: 'performance_score',
          value: campaign.ctr / campaign.cpc,
          data: { campaignId: campaign.id, campaignName: campaign.name },
        });
      }

      // Zero conversions warning
      if (campaign.spend > 10 && campaign.conversions === 0) {
        insights.push({
          id: `meta-no-conversions-${campaign.id}`,
          type: 'warning',
          title: `No Conversions: ${campaign.name}`,
          description: `Spent $${campaign.spend.toFixed(2)} with zero conversions. Pixel tracking may need attention.`,
          metric: 'conversions',
          value: 0,
          data: { campaignId: campaign.id, campaignName: campaign.name },
        });
      }
    }

    // Pixel tracking check
    if (!context.meta.pixelTracking?.configured) {
      insights.push({
        id: `meta-no-pixel-${Date.now()}`,
        type: 'warning',
        title: 'Pixel Not Configured',
        description: 'Meta Pixel and Conversions API are not set up. You\'re missing critical conversion data.',
      });
    }
  }

  // Check if Meta not connected but has smartlink traffic
  if (!context.meta.connected && context.smartlinks.totalClicks > 50) {
    insights.push({
      id: `meta-opportunity-${Date.now()}`,
      type: 'opportunity',
      title: 'Connect Meta Ads',
      description: 'You have organic traffic. Amplify it with Meta ads to reach more fans.',
    });
  }

  // Opportunity seeding: If no insights but campaigns exist, add a "stable" insight
  if (insights.length === 0 && context.meta.connected && context.meta.campaigns && context.meta.campaigns.length > 0) {
    insights.push({
      id: `stable-${Date.now()}`,
      type: 'success',
      title: 'Campaigns Running Smoothly',
      description: `Your ${context.meta.campaigns.length} campaign${context.meta.campaigns.length > 1 ? 's are' : ' is'} performing within expected ranges. No immediate optimizations needed.`,
    });
  }

  // If still no insights and smartlinks exist, add traffic insight
  if (insights.length === 0 && context.smartlinks.totalClicks > 0) {
    insights.push({
      id: `tracking-${Date.now()}`,
      type: 'info',
      title: 'Traffic Tracking Active',
      description: `Tracking ${context.smartlinks.totalClicks} clicks across ${Object.keys(context.smartlinks.clicksByPlatform).length} platforms. Continue monitoring for optimization opportunities.`,
    });
  }

  return insights;
}

export function proposeActions(insights: Insight[], context: OperatorContext): ProposedAction[] {
  const actions: ProposedAction[] = [];

  // Check cooldown for recent actions
  const recentActionsByCategory: Record<string, Date> = {};
  context.recentActions.forEach(action => {
    const actionDate = new Date(action.createdAt);
    if (!recentActionsByCategory[action.category] || actionDate > recentActionsByCategory[action.category]) {
      recentActionsByCategory[action.category] = actionDate;
    }
  });

  const isOutsideCooldown = (category: string): boolean => {
    if (!recentActionsByCategory[category]) return true;
    const hoursSince = (Date.now() - recentActionsByCategory[category].getTime()) / (1000 * 60 * 60);
    return hoursSince >= context.operator.cooldownHours;
  };

  for (const insight of insights) {
    // Low CTR => Creative refresh
    if (insight.id.includes('meta-low-ctr') && insight.data) {
      const campaign = context.meta.campaigns?.find(c => c.id === insight.data.campaignId);
      if (!campaign) continue;

      if (isOutsideCooldown('creative')) {
        actions.push({
          category: 'creative',
          title: `Refresh Creative for ${campaign.name}`,
          reasoning: `CTR is ${insight.value?.toFixed(2)}% after ${campaign.impressions.toLocaleString()} impressions. Time to test new angles.`,
          payload: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            currentCtr: insight.value,
            action: 'request_new_creative',
          },
          safetyChecks: {
            withinBudgetCap: true,
            withinChangePct: true,
            meetsMinImpressions: campaign.impressions >= context.operator.minImpressionsForKill,
            outsideCooldown: true,
            estimatedImpact: 'Could improve CTR by 30-50% with fresh creative',
            riskLevel: 'low',
          },
          priority: 70,
        });
      }
    }

    // High CPC => Pause or optimize
    if (insight.id.includes('meta-high-cpc') && insight.data) {
      const campaign = context.meta.campaigns?.find(c => c.id === insight.data.campaignId);
      if (!campaign) continue;

      if (isOutsideCooldown('pause') && campaign.spend > 20) {
        actions.push({
          category: 'pause',
          title: `Pause High-Cost Campaign: ${campaign.name}`,
          reasoning: `CPC is $${insight.value?.toFixed(2)} which is above efficient levels. Pause to prevent waste.`,
          payload: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            currentCpc: insight.value,
            action: 'pause_campaign',
          },
          safetyChecks: {
            withinBudgetCap: true,
            withinChangePct: true,
            meetsMinImpressions: campaign.impressions >= context.operator.minImpressionsForKill,
            outsideCooldown: true,
            estimatedImpact: 'Prevents further budget waste on inefficient campaign',
            riskLevel: 'low',
          },
          priority: 80,
        });
      }
    }

    // Winner => Scale
    if (insight.id.includes('meta-winner') && insight.data) {
      const campaign = context.meta.campaigns?.find(c => c.id === insight.data.campaignId);
      if (!campaign) continue;

      const newBudget = campaign.budget * 1.2; // 20% increase
      const budgetIncreasePct = 20;

      if (isOutsideCooldown('budget') && budgetIncreasePct <= context.operator.maxBudgetChangePct) {
        actions.push({
          category: 'budget',
          title: `Scale Winner: ${campaign.name}`,
          reasoning: `Strong performance (${campaign.ctr.toFixed(2)}% CTR, $${campaign.cpc.toFixed(2)} CPC). Increase budget by ${budgetIncreasePct}%.`,
          payload: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            currentBudget: campaign.budget,
            newBudget,
            increasePct: budgetIncreasePct,
            action: 'increase_budget',
          },
          safetyChecks: {
            withinBudgetCap: newBudget <= context.operator.dailySpendCapCents,
            withinChangePct: budgetIncreasePct <= context.operator.maxBudgetChangePct,
            meetsMinImpressions: campaign.impressions >= context.operator.minImpressionsForKill,
            outsideCooldown: true,
            estimatedImpact: `Could increase reach by 20% while maintaining efficiency`,
            riskLevel: 'low',
          },
          priority: 90,
        });
      }

      // Duplicate winner into new adset
      if (isOutsideCooldown('duplicate')) {
        actions.push({
          category: 'duplicate',
          title: `Duplicate Winner to New Audience: ${campaign.name}`,
          reasoning: `This creative is performing well. Test it with a new audience segment to expand reach.`,
          payload: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            action: 'duplicate_to_new_adset',
            newAudienceStrategy: 'lookalike',
          },
          safetyChecks: {
            withinBudgetCap: true,
            withinChangePct: true,
            meetsMinImpressions: campaign.impressions >= context.operator.minImpressionsForKill,
            outsideCooldown: true,
            estimatedImpact: 'Expand reach while leveraging proven creative',
            riskLevel: 'medium',
          },
          priority: 75,
        });
      }
    }

    // No conversions => Check tracking
    if (insight.id.includes('meta-no-conversions') && insight.data) {
      const campaign = context.meta.campaigns?.find(c => c.id === insight.data.campaignId);
      if (!campaign) continue;

      if (isOutsideCooldown('tracking')) {
        actions.push({
          category: 'tracking',
          title: `Diagnose Tracking for ${campaign.name}`,
          reasoning: `Campaign has spend but zero conversions. Pixel or CAPI setup may need attention.`,
          payload: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            action: 'diagnose_tracking',
            checks: ['pixel_firing', 'capi_events', 'conversion_setup'],
          },
          safetyChecks: {
            withinBudgetCap: true,
            withinChangePct: true,
            meetsMinImpressions: true,
            outsideCooldown: true,
            estimatedImpact: 'Fix tracking to optimize for actual conversions',
            riskLevel: 'low',
          },
          priority: 85,
        });
      }
    }

    // No pixel => Set up tracking
    if (insight.id.includes('meta-no-pixel')) {
      if (isOutsideCooldown('tracking')) {
        actions.push({
          category: 'tracking',
          title: 'Set Up Meta Pixel & Conversions API',
          reasoning: 'You\'re running ads blind without conversion tracking. This is critical for optimization.',
          payload: {
            action: 'setup_pixel_capi',
            steps: ['create_pixel', 'generate_capi_token', 'configure_smart_links'],
          },
          safetyChecks: {
            withinBudgetCap: true,
            withinChangePct: true,
            meetsMinImpressions: true,
            outsideCooldown: true,
            estimatedImpact: 'Enable conversion tracking for better ad optimization',
            riskLevel: 'low',
          },
          priority: 95,
        });
      }
    }

    // Low smartlink traffic => Suggest first campaign
    if (insight.id.includes('sl-warning')) {
      if (isOutsideCooldown('campaign')) {
        actions.push({
          category: 'campaign',
          title: 'Launch First Meta Ad Campaign',
          reasoning: 'Your smart links need more visibility. A small test campaign can drive targeted traffic.',
          payload: {
            action: 'create_first_campaign',
            suggestedBudget: 1000,
            suggestedDuration: 7,
            objective: 'LINK_CLICKS',
          },
          safetyChecks: {
            withinBudgetCap: 1000 <= context.operator.dailySpendCapCents,
            withinChangePct: true,
            meetsMinImpressions: true,
            outsideCooldown: true,
            estimatedImpact: 'Drive initial traffic to validate smart link performance',
            riskLevel: 'low',
          },
          priority: 60,
        });
      }
    }
  }

  // Opportunity seeding: If no actions but campaigns exist, add informational action
  if (actions.length === 0 && context.meta.connected && context.meta.campaigns && context.meta.campaigns.length > 0) {
    actions.push({
      category: 'campaign',
      title: 'Campaigns Stable - No Changes Needed',
      reasoning: 'All campaigns are performing within acceptable ranges. Operator is monitoring continuously.',
      payload: {
        action: 'monitor',
        status: 'stable',
      },
      safetyChecks: {
        withinBudgetCap: true,
        withinChangePct: true,
        meetsMinImpressions: true,
        outsideCooldown: true,
        estimatedImpact: 'Continue monitoring for future optimization opportunities',
        riskLevel: 'low',
      },
      priority: 10,
    });
  }

  // Sort by priority (highest first)
  return actions.sort((a, b) => b.priority - a.priority);
}
