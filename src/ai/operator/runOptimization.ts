/**
 * Run Optimization - Generate Proposed Actions
 * Uses rule-based logic (no LLM) to suggest improvements
 */

import { supabase } from '../../lib/supabase';
import { getManagerContext, type ManagerContext } from '../context/getManagerContext';

export interface ProposedAction {
  category: 'budget' | 'pause' | 'duplicate' | 'creative' | 'campaign' | 'tracking' | 'smartlink';
  title: string;
  reasoning: string;
  payload: Record<string, any>;
  safetyChecks: Record<string, any>;
  priority: number;
}

export async function runOptimization(userId: string): Promise<{
  success: boolean;
  actions: ProposedAction[];
  insights: Array<{ type: string; title: string; message: string }>;
  error?: string;
}> {
  try {
    console.log('[runOptimization] Starting for user:', userId);

    // Fetch manager context
    const context = await getManagerContext(userId);
    console.log('[runOptimization] Context fetched:', {
      metaConnected: context.meta.connected,
      campaigns: context.meta.campaigns.length,
      tracking: context.tracking.clicks7d,
    });

    // Fetch settings to get thresholds
    const { data: settings } = await supabase
      .from('ai_operator_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const minImpressions = settings?.min_impressions_for_kill || 1000;

    const actions: ProposedAction[] = [];
    const insights: Array<{ type: string; title: string; message: string }> = [];

    // ========================================
    // META ADS OPTIMIZATION
    // ========================================
    if (context.meta.connected && context.meta.campaigns.length > 0) {
      for (const campaign of context.meta.campaigns) {
        // Rule 1: Low CTR campaigns need creative refresh
        if (campaign.impressions >= minImpressions && campaign.ctr < 0.7) {
          actions.push({
            category: 'creative',
            title: `Refresh Creative - ${campaign.name}`,
            reasoning: `Campaign "${campaign.name}" has low CTR (${campaign.ctr.toFixed(2)}%) after ${campaign.impressions} impressions. New creative could improve performance.`,
            payload: {
              campaignId: campaign.id,
              campaignName: campaign.name,
              currentCtr: campaign.ctr,
              impressions: campaign.impressions,
            },
            safetyChecks: {
              minImpressions: campaign.impressions >= minImpressions,
              lowCtr: campaign.ctr < 0.7,
            },
            priority: 70,
          });

          insights.push({
            type: 'warning',
            title: 'Low CTR Detected',
            message: `"${campaign.name}" CTR is ${campaign.ctr.toFixed(2)}% - below target`,
          });
        }

        // Rule 2: Spending but no clicks = tracking issue
        if (campaign.spend > 0 && campaign.clicks === 0 && campaign.impressions > 100) {
          actions.push({
            category: 'tracking',
            title: `Diagnose Tracking - ${campaign.name}`,
            reasoning: `Campaign "${campaign.name}" spent $${campaign.spend.toFixed(2)} but got 0 clicks. This may indicate a tracking or targeting issue.`,
            payload: {
              campaignId: campaign.id,
              campaignName: campaign.name,
              spend: campaign.spend,
              impressions: campaign.impressions,
            },
            safetyChecks: {
              hasSpend: campaign.spend > 0,
              noClicks: campaign.clicks === 0,
            },
            priority: 90,
          });

          insights.push({
            type: 'warning',
            title: 'Tracking Issue',
            message: `"${campaign.name}" has spend but no clicks - check tracking`,
          });
        }

        // Rule 3: High CTR winners should be scaled
        if (campaign.impressions >= minImpressions && campaign.ctr > 1.5 && campaign.status === 'ACTIVE') {
          actions.push({
            category: 'duplicate',
            title: `Scale Winner - ${campaign.name}`,
            reasoning: `Campaign "${campaign.name}" is performing well (${campaign.ctr.toFixed(2)}% CTR, $${campaign.cpc.toFixed(2)} CPC). Consider duplicating or increasing budget.`,
            payload: {
              campaignId: campaign.id,
              campaignName: campaign.name,
              ctr: campaign.ctr,
              cpc: campaign.cpc,
            },
            safetyChecks: {
              highCtr: campaign.ctr > 1.5,
              active: campaign.status === 'ACTIVE',
            },
            priority: 80,
          });

          insights.push({
            type: 'success',
            title: 'Winner Found',
            message: `"${campaign.name}" performing above target - scale opportunity`,
          });
        }

        // Rule 4: Inactive campaigns with recent spend should be paused
        if (campaign.status === 'ACTIVE' && campaign.spend > 0 && campaign.ctr < 0.5) {
          actions.push({
            category: 'pause',
            title: `Pause Underperformer - ${campaign.name}`,
            reasoning: `Campaign "${campaign.name}" is underperforming ($${campaign.spend.toFixed(2)} spend, ${campaign.ctr.toFixed(2)}% CTR). Pause to stop wasting budget.`,
            payload: {
              campaignId: campaign.id,
              campaignName: campaign.name,
              spend: campaign.spend,
              ctr: campaign.ctr,
            },
            safetyChecks: {
              active: campaign.status === 'ACTIVE',
              lowPerformance: campaign.ctr < 0.5,
            },
            priority: 75,
          });
        }
      }

      // Summary insights
      const activeCampaigns = context.meta.campaigns.filter(c => c.status === 'ACTIVE').length;
      if (activeCampaigns > 0) {
        insights.push({
          type: 'info',
          title: 'Active Campaigns',
          message: `You have ${activeCampaigns} active campaigns spending $${context.summary.totalSpend7d.toFixed(2)}/week`,
        });
      }
    } else if (!context.meta.connected) {
      // Meta not connected - suggest connection
      insights.push({
        type: 'info',
        title: 'Meta Ads Not Connected',
        message: 'Connect Meta Ads to get automated optimization suggestions',
      });
    }

    // ========================================
    // SMARTLINK OPTIMIZATION (always available)
    // ========================================
    if (context.tracking.topLinks.length > 0) {
      const topLink = context.tracking.topLinks[0];

      // Rule: Top SmartLink should be promoted with ads
      if (topLink.clicks > 50 && context.meta.campaigns.length === 0) {
        actions.push({
          category: 'smartlink',
          title: `Promote Top SmartLink "${topLink.slug}"`,
          reasoning: `Your SmartLink "${topLink.slug}" got ${topLink.clicks} organic clicks. Run Meta ads to amplify this success.`,
          payload: {
            linkSlug: topLink.slug,
            clicks: topLink.clicks,
          },
          safetyChecks: {
            hasClicks: topLink.clicks > 50,
          },
          priority: 60,
        });

        insights.push({
          type: 'opportunity',
          title: 'SmartLink Opportunity',
          message: `"${topLink.slug}" is your top performer - consider paid promotion`,
        });
      }

      // Rule: Declining SmartLink clicks
      if (context.tracking.clicks7d > 0 && context.tracking.clicks7d < context.tracking.clicks30d * 0.15) {
        actions.push({
          category: 'smartlink',
          title: 'Refresh SmartLink Strategy',
          reasoning: `Your SmartLink clicks dropped significantly (${context.tracking.clicks7d} last 7d vs ${context.tracking.clicks30d} last 30d). Consider refreshing content and retargeting fans.`,
          payload: {
            clicks7d: context.tracking.clicks7d,
            clicks30d: context.tracking.clicks30d,
            decline: ((1 - (context.tracking.clicks7d / (context.tracking.clicks30d * 0.25))) * 100).toFixed(0),
          },
          safetyChecks: {
            declining: true,
          },
          priority: 65,
        });

        insights.push({
          type: 'warning',
          title: 'Declining Engagement',
          message: 'SmartLink clicks dropped week-over-week',
        });
      }
    }

    // ========================================
    // GHOSTE ADS OPTIMIZATION
    // ========================================
    if (context.ghoste.drafts > 0) {
      insights.push({
        type: 'info',
        title: 'Pending Drafts',
        message: `You have ${context.ghoste.drafts} draft campaigns ready to launch`,
      });
    }

    // Sort actions by priority (highest first)
    actions.sort((a, b) => b.priority - a.priority);

    // Insert actions into database
    if (actions.length > 0) {
      const actionRows = actions.map(a => ({
        user_id: userId,
        status: 'proposed',
        category: a.category,
        title: a.title,
        reasoning: a.reasoning,
        payload: a.payload,
        safety_checks: a.safetyChecks,
      }));

      const { error: insertError } = await supabase
        .from('ai_operator_actions')
        .insert(actionRows);

      if (insertError) {
        console.error('[runOptimization] Insert error:', insertError);
        return {
          success: false,
          actions: [],
          insights: [],
          error: insertError.message,
        };
      }
    }

    console.log('[runOptimization] Complete:', {
      actions: actions.length,
      insights: insights.length,
    });

    return {
      success: true,
      actions,
      insights,
    };
  } catch (error: any) {
    console.error('[runOptimization] Error:', error);
    return {
      success: false,
      actions: [],
      insights: [],
      error: error.message,
    };
  }
}
