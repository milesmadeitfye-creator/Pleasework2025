/**
 * Release Planning - Think Phase (No DB Writes)
 * Generates a structured release plan without committing to calendar/campaigns
 */

import { supabase } from '../../lib/supabase';

export interface ReleaseAction {
  phase: string;
  days_out: number;
  action_type: 'content' | 'calendar' | 'campaign' | 'social' | 'email' | 'tracking';
  title: string;
  description: string;
  recommended_date: string;
  priority: 'high' | 'medium' | 'low';
  estimated_duration?: string;
}

export interface ReleasePlan {
  release_type: 'single' | 'ep' | 'album';
  release_date: string;
  title: string;
  phases: Array<{
    phase: string;
    days_out: number;
    actions: ReleaseAction[];
  }>;
  metadata: {
    created_at: string;
    total_actions: number;
    budget_estimate?: number;
  };
}

export interface PlanReleaseInput {
  releaseDate: string;
  releaseType: 'single' | 'ep' | 'album';
  title?: string;
  hasSmartLink?: boolean;
  hasMetaAds?: boolean;
  hasMailchimp?: boolean;
}

/**
 * Generate a release plan based on user input
 * This function THINKS but does NOT write to calendar/campaigns
 */
export async function planRelease(
  userId: string,
  input: PlanReleaseInput
): Promise<{
  success: boolean;
  plan?: ReleasePlan;
  proposedActionIds?: string[];
  error?: string;
}> {
  try {
    console.log('[planRelease] Starting for user:', userId, input);

    const releaseDate = new Date(input.releaseDate);
    if (isNaN(releaseDate.getTime())) {
      return {
        success: false,
        error: 'Invalid release date format',
      };
    }

    // ========================================
    // THINK: Generate Release Timeline
    // ========================================

    const plan: ReleasePlan = {
      release_type: input.releaseType,
      release_date: input.releaseDate,
      title: input.title || `${input.releaseType} Release`,
      phases: [],
      metadata: {
        created_at: new Date().toISOString(),
        total_actions: 0,
      },
    };

    // Helper to calculate date
    const getDate = (daysOut: number): string => {
      const date = new Date(releaseDate);
      date.setDate(date.getDate() + daysOut);
      return date.toISOString().split('T')[0];
    };

    // ========================================
    // PHASE 1: PRE-RELEASE (-21 to -1 days)
    // ========================================
    const preReleaseActions: ReleaseAction[] = [];

    // Content creation
    preReleaseActions.push({
      phase: 'Pre-Release',
      days_out: -21,
      action_type: 'content',
      title: 'Create Release Assets',
      description: 'Design cover art, shoot promotional content, record snippets',
      recommended_date: getDate(-21),
      priority: 'high',
      estimated_duration: '3-5 days',
    });

    // SmartLink setup
    if (input.hasSmartLink) {
      preReleaseActions.push({
        phase: 'Pre-Release',
        days_out: -14,
        action_type: 'tracking',
        title: 'Create Pre-Save SmartLink',
        description: 'Set up pre-save link with Meta Pixel tracking enabled',
        recommended_date: getDate(-14),
        priority: 'high',
        estimated_duration: '30 minutes',
      });
    }

    // Meta Ads setup
    if (input.hasMetaAds) {
      preReleaseActions.push({
        phase: 'Pre-Release',
        days_out: -10,
        action_type: 'campaign',
        title: 'Launch Pre-Release Ads',
        description: 'Run Meta ads to drive pre-saves and build anticipation',
        recommended_date: getDate(-10),
        priority: 'high',
        estimated_duration: '1 hour',
      });
    }

    // Email campaign
    if (input.hasMailchimp) {
      preReleaseActions.push({
        phase: 'Pre-Release',
        days_out: -7,
        action_type: 'email',
        title: 'Send Pre-Release Email',
        description: 'Notify fans about upcoming release, include pre-save link',
        recommended_date: getDate(-7),
        priority: 'medium',
        estimated_duration: '1 hour',
      });
    }

    // Social media teasers
    preReleaseActions.push({
      phase: 'Pre-Release',
      days_out: -3,
      action_type: 'social',
      title: 'Post Release Countdown',
      description: 'Share 3-day countdown posts on social media',
      recommended_date: getDate(-3),
      priority: 'medium',
      estimated_duration: '30 minutes',
    });

    plan.phases.push({
      phase: 'Pre-Release',
      days_out: -21,
      actions: preReleaseActions,
    });

    // ========================================
    // PHASE 2: RELEASE WEEK (0 to +2 days)
    // ========================================
    const releaseWeekActions: ReleaseAction[] = [];

    // Release day
    releaseWeekActions.push({
      phase: 'Release Week',
      days_out: 0,
      action_type: 'calendar',
      title: 'RELEASE DAY',
      description: `${input.title || 'Release'} goes live on all platforms`,
      recommended_date: getDate(0),
      priority: 'high',
      estimated_duration: 'All day',
    });

    // Update SmartLink
    if (input.hasSmartLink) {
      releaseWeekActions.push({
        phase: 'Release Week',
        days_out: 0,
        action_type: 'tracking',
        title: 'Switch SmartLink to Stream Mode',
        description: 'Update SmartLink from pre-save to streaming links',
        recommended_date: getDate(0),
        priority: 'high',
        estimated_duration: '15 minutes',
      });
    }

    // Launch ads
    if (input.hasMetaAds) {
      releaseWeekActions.push({
        phase: 'Release Week',
        days_out: 0,
        action_type: 'campaign',
        title: 'Launch Release Day Ads',
        description: 'Run Meta ads targeting fans who pre-saved + lookalikes',
        recommended_date: getDate(0),
        priority: 'high',
        estimated_duration: '1 hour',
      });
    }

    // Release announcement
    releaseWeekActions.push({
      phase: 'Release Week',
      days_out: 0,
      action_type: 'social',
      title: 'Post Release Announcement',
      description: 'Share official release post with SmartLink across all platforms',
      recommended_date: getDate(0),
      priority: 'high',
      estimated_duration: '30 minutes',
    });

    // Email blast
    if (input.hasMailchimp) {
      releaseWeekActions.push({
        phase: 'Release Week',
        days_out: 1,
        action_type: 'email',
        title: 'Send Release Email',
        description: 'Email fans with streaming links and behind-the-scenes content',
        recommended_date: getDate(1),
        priority: 'medium',
        estimated_duration: '1 hour',
      });
    }

    plan.phases.push({
      phase: 'Release Week',
      days_out: 0,
      actions: releaseWeekActions,
    });

    // ========================================
    // PHASE 3: POST-RELEASE (+7 to +30 days)
    // ========================================
    const postReleaseActions: ReleaseAction[] = [];

    // Analytics check
    postReleaseActions.push({
      phase: 'Post-Release',
      days_out: 7,
      action_type: 'tracking',
      title: 'Review Week 1 Analytics',
      description: 'Check streams, SmartLink clicks, ad performance, engagement metrics',
      recommended_date: getDate(7),
      priority: 'medium',
      estimated_duration: '1 hour',
    });

    // Ad optimization
    if (input.hasMetaAds) {
      postReleaseActions.push({
        phase: 'Post-Release',
        days_out: 7,
        action_type: 'campaign',
        title: 'Optimize Ad Campaigns',
        description: 'Pause underperformers, scale winners, refresh creative',
        recommended_date: getDate(7),
        priority: 'medium',
        estimated_duration: '1 hour',
      });
    }

    // Content repurpose
    postReleaseActions.push({
      phase: 'Post-Release',
      days_out: 14,
      action_type: 'social',
      title: 'Share Fan Content',
      description: 'Repost fan reactions, playlist adds, and user-generated content',
      recommended_date: getDate(14),
      priority: 'low',
      estimated_duration: '30 minutes',
    });

    // Follow-up email
    if (input.hasMailchimp) {
      postReleaseActions.push({
        phase: 'Post-Release',
        days_out: 14,
        action_type: 'email',
        title: 'Send Thank You Email',
        description: 'Thank fans for support, share milestones, tease next release',
        recommended_date: getDate(14),
        priority: 'low',
        estimated_duration: '1 hour',
      });
    }

    // Final review
    postReleaseActions.push({
      phase: 'Post-Release',
      days_out: 30,
      action_type: 'tracking',
      title: 'Month 1 Performance Review',
      description: 'Complete analytics review, document learnings for next release',
      recommended_date: getDate(30),
      priority: 'medium',
      estimated_duration: '2 hours',
    });

    plan.phases.push({
      phase: 'Post-Release',
      days_out: 7,
      actions: postReleaseActions,
    });

    // Calculate totals
    plan.metadata.total_actions = plan.phases.reduce(
      (sum, phase) => sum + phase.actions.length,
      0
    );

    // Estimate budget (if Meta ads enabled)
    if (input.hasMetaAds) {
      plan.metadata.budget_estimate = 500; // $500 baseline for 30-day campaign
    }

    // ========================================
    // COMMIT TO PROPOSED ACTIONS (NOT CALENDAR)
    // ========================================
    const proposedActionRows = plan.phases.flatMap(phase =>
      phase.actions.map(action => ({
        user_id: userId,
        status: 'proposed' as const,
        category: 'release' as const,
        title: action.title,
        reasoning: `${action.phase}: ${action.description}`,
        payload: {
          release_plan_id: `plan_${Date.now()}`,
          phase: action.phase,
          days_out: action.days_out,
          action_type: action.action_type,
          recommended_date: action.recommended_date,
          priority: action.priority,
          estimated_duration: action.estimated_duration,
          release_title: input.title,
          release_type: input.releaseType,
          release_date: input.releaseDate,
        },
        safety_checks: {
          is_release_plan: true,
          requires_approval: true,
          affects_calendar: action.action_type === 'calendar',
          affects_campaigns: action.action_type === 'campaign',
        },
      }))
    );

    console.log('[planRelease] Inserting proposed actions:', proposedActionRows.length);

    const { data: insertedActions, error: insertError } = await supabase
      .from('ai_operator_actions')
      .insert(proposedActionRows)
      .select('id');

    if (insertError) {
      console.error('[planRelease] Insert error:', insertError);
      return {
        success: false,
        error: `Failed to save plan: ${insertError.message}`,
      };
    }

    const actionIds = insertedActions?.map(a => a.id) || [];

    console.log('[planRelease] Complete:', {
      total_actions: plan.metadata.total_actions,
      proposed_action_ids: actionIds.length,
    });

    return {
      success: true,
      plan,
      proposedActionIds: actionIds,
    };
  } catch (error: any) {
    console.error('[planRelease] Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}
