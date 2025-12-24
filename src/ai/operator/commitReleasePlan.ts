/**
 * Commit Release Plan - Execution Phase
 * Takes approved release plan actions and writes to calendar/campaigns
 * Each action wrapped in try/catch for resilience
 */

import { supabase } from '../../lib/supabase';

export interface CommitResult {
  action_id: string;
  title: string;
  success: boolean;
  error?: string;
  created_id?: string;
}

export interface CommitSummary {
  total: number;
  succeeded: number;
  failed: number;
  results: CommitResult[];
}

/**
 * Commit approved release plan actions to calendar/campaigns
 * Resilient: Continues on individual failures
 */
export async function commitReleasePlan(
  userId: string,
  actionIds: string[]
): Promise<{
  success: boolean;
  summary: CommitSummary;
  error?: string;
}> {
  try {
    console.log('[commitReleasePlan] Starting for user:', userId, 'actions:', actionIds.length);

    if (actionIds.length === 0) {
      return {
        success: false,
        summary: { total: 0, succeeded: 0, failed: 0, results: [] },
        error: 'No actions to commit',
      };
    }

    // Fetch approved actions
    const { data: actions, error: fetchError } = await supabase
      .from('ai_operator_actions')
      .select('*')
      .in('id', actionIds)
      .eq('user_id', userId)
      .eq('status', 'approved');

    if (fetchError) {
      console.error('[commitReleasePlan] Fetch error:', fetchError);
      return {
        success: false,
        summary: { total: 0, succeeded: 0, failed: 0, results: [] },
        error: fetchError.message,
      };
    }

    if (!actions || actions.length === 0) {
      return {
        success: false,
        summary: { total: 0, succeeded: 0, failed: 0, results: [] },
        error: 'No approved actions found',
      };
    }

    const results: CommitResult[] = [];
    let succeeded = 0;
    let failed = 0;

    // ========================================
    // COMMIT EACH ACTION (WITH RESILIENCE)
    // ========================================
    for (const action of actions) {
      const result: CommitResult = {
        action_id: action.id,
        title: action.title,
        success: false,
      };

      try {
        const actionType = action.payload?.action_type;

        // ========================================
        // CALENDAR EVENTS
        // ========================================
        if (actionType === 'calendar' || actionType === 'content' || actionType === 'social') {
          const { data: event, error: calendarError } = await supabase
            .from('ai_calendar_events')
            .insert({
              user_id: userId,
              title: action.title,
              description: action.reasoning,
              start_time: `${action.payload.recommended_date}T12:00:00Z`,
              end_time: `${action.payload.recommended_date}T13:00:00Z`,
              event_type: 'release',
              category: actionType === 'content' ? 'content' : 'promotion',
              metadata: {
                release_plan_id: action.payload.release_plan_id,
                phase: action.payload.phase,
                priority: action.payload.priority,
                estimated_duration: action.payload.estimated_duration,
              },
            })
            .select('id')
            .single();

          if (calendarError) {
            throw new Error(`Calendar insert failed: ${calendarError.message}`);
          }

          result.success = true;
          result.created_id = event?.id;
          succeeded++;
        }

        // ========================================
        // META AD CAMPAIGNS
        // ========================================
        else if (actionType === 'campaign') {
          // Create draft campaign in meta_ad_campaigns
          const { data: campaign, error: campaignError } = await supabase
            .from('meta_ad_campaigns')
            .insert({
              user_id: userId,
              name: action.title,
              status: 'draft',
              objective: 'OUTCOME_TRAFFIC',
              daily_budget: 2000, // $20/day default
              metadata: {
                release_plan_id: action.payload.release_plan_id,
                phase: action.payload.phase,
                recommended_date: action.payload.recommended_date,
                reasoning: action.reasoning,
              },
            })
            .select('id')
            .single();

          if (campaignError) {
            throw new Error(`Campaign insert failed: ${campaignError.message}`);
          }

          result.success = true;
          result.created_id = campaign?.id;
          succeeded++;
        }

        // ========================================
        // EMAIL CAMPAIGNS
        // ========================================
        else if (actionType === 'email') {
          // Create scheduled email in social_posts (reuse for all content)
          const { data: email, error: emailError } = await supabase
            .from('social_posts')
            .insert({
              user_id: userId,
              content: action.reasoning,
              scheduled_for: `${action.payload.recommended_date}T10:00:00Z`,
              status: 'scheduled',
              platforms: ['mailchimp'],
              metadata: {
                release_plan_id: action.payload.release_plan_id,
                phase: action.payload.phase,
                email_subject: action.title,
              },
            })
            .select('id')
            .single();

          if (emailError) {
            throw new Error(`Email schedule failed: ${emailError.message}`);
          }

          result.success = true;
          result.created_id = email?.id;
          succeeded++;
        }

        // ========================================
        // TRACKING / OTHER ACTIONS
        // ========================================
        else if (actionType === 'tracking') {
          // Create calendar reminder for tracking tasks
          const { data: tracking, error: trackingError } = await supabase
            .from('ai_calendar_events')
            .insert({
              user_id: userId,
              title: action.title,
              description: action.reasoning,
              start_time: `${action.payload.recommended_date}T14:00:00Z`,
              end_time: `${action.payload.recommended_date}T15:00:00Z`,
              event_type: 'task',
              category: 'analytics',
              metadata: {
                release_plan_id: action.payload.release_plan_id,
                phase: action.payload.phase,
              },
            })
            .select('id')
            .single();

          if (trackingError) {
            throw new Error(`Tracking reminder failed: ${trackingError.message}`);
          }

          result.success = true;
          result.created_id = tracking?.id;
          succeeded++;
        }

        // Unknown action type - skip
        else {
          result.success = false;
          result.error = `Unknown action_type: ${actionType}`;
          failed++;
        }

        // Update action status to executed
        if (result.success) {
          await supabase
            .from('ai_operator_actions')
            .update({
              status: 'executed',
              result: {
                executed_at: new Date().toISOString(),
                created_id: result.created_id,
              },
            })
            .eq('id', action.id);
        }
      } catch (error: any) {
        console.error('[commitReleasePlan] Action failed:', action.title, error);
        result.success = false;
        result.error = error.message;
        failed++;

        // Update action status to failed
        await supabase
          .from('ai_operator_actions')
          .update({
            status: 'failed',
            result: {
              failed_at: new Date().toISOString(),
              error: error.message,
            },
          })
          .eq('id', action.id);
      }

      results.push(result);
    }

    const summary: CommitSummary = {
      total: actions.length,
      succeeded,
      failed,
      results,
    };

    console.log('[commitReleasePlan] Complete:', summary);

    // Consider partial success if at least one action succeeded
    const overallSuccess = succeeded > 0;

    return {
      success: overallSuccess,
      summary,
      error: failed > 0 ? `${failed} of ${actions.length} actions failed` : undefined,
    };
  } catch (error: any) {
    console.error('[commitReleasePlan] Fatal error:', error);
    return {
      success: false,
      summary: { total: 0, succeeded: 0, failed: 0, results: [] },
      error: error.message,
    };
  }
}
