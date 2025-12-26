import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { checkKillswitch, decideAction, logDecision, type StudentSignals, type TeacherScore } from "./_aiManagerStrictEngine";
import { triggerMailchimpAutomation, generateApprovalMessage, generateCreativeRequestMessage, generatePauseNotice } from "./_aiMailchimpTrigger";
import { generateCreativeBrief, createCreativeRequest } from "./_creativeBriefGenerator";

const BASE_URL = process.env.URL || 'https://ghoste.one';

export const handler: Handler = async (event) => {
  const supabase = getSupabaseAdmin();

  try {
    const killswitchActive = await checkKillswitch();

    if (killswitchActive) {
      console.log('[ai-manager-daily-runner-v2] ⛔ Killswitch active. All AI actions disabled.');
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, processed: 0, reason: 'killswitch_active' }),
      };
    }

    const { data: campaigns } = await supabase
      .from('ghoste_campaigns')
      .select('*')
      .eq('manager_mode_enabled', true)
      .eq('disable_ai_actions', false)
      .in('status', ['active', 'live']);

    if (!campaigns || campaigns.length === 0) {
      console.log('[ai-manager-daily-runner-v2] No active manager campaigns');
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, processed: 0 }),
      };
    }

    let processed = 0;

    for (const campaign of campaigns) {
      const lastMessageHours = campaign.last_ai_message_at
        ? (Date.now() - new Date(campaign.last_ai_message_at).getTime()) / (1000 * 60 * 60)
        : 999;

      if (lastMessageHours < 24 && campaign.force_silence_mode) {
        console.log('[ai-manager-daily-runner-v2] ⏭️ Skip (silence mode):', campaign.id);
        continue;
      }

      if (!campaign.latest_score) {
        console.log('[ai-manager-daily-runner-v2] ⏭️ Skip (no score yet):', campaign.id);
        continue;
      }

      const teacherScore: TeacherScore = {
        score: campaign.latest_score,
        grade: campaign.latest_grade as 'fail' | 'weak' | 'pass' | 'strong',
        confidence: campaign.latest_confidence as 'low' | 'medium' | 'high',
        reasons: [],
      };

      const startDate = campaign.created_at ? new Date(campaign.created_at) : new Date();
      const daysRunning = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      const creativeIds = campaign.config?.creative_ids || [];

      const studentSignals: StudentSignals = {
        campaign_id: campaign.id,
        days_running: daysRunning,
        total_spend_cents: campaign.total_spend_cents || 0,
        current_daily_budget_cents: campaign.daily_budget_cents,
        max_daily_budget_cents: campaign.max_daily_budget_cents,
        creatives_count: creativeIds.length,
        creative_fatigue_detected: campaign.creative_fatigue_score >= 70,
      };

      const decision = decideAction({
        student_signals: studentSignals,
        teacher_score: teacherScore,
        killswitch_active: false,
        silence_mode_active: campaign.force_silence_mode,
        force_silence: campaign.force_silence_mode,
        last_message_hours_ago: lastMessageHours,
      });

      const decisionId = await logDecision(
        campaign.owner_user_id,
        campaign.id,
        {
          student_signals: studentSignals,
          teacher_score: teacherScore,
          killswitch_active: false,
          silence_mode_active: campaign.force_silence_mode,
          force_silence: campaign.force_silence_mode,
          last_message_hours_ago: lastMessageHours,
        },
        decision
      );

      console.log('[ai-manager-daily-runner-v2] Decision:', campaign.id, decision.action);

      if (decision.action === 'no_action') {
        continue;
      }

      if (decision.action === 'make_more_creatives') {
        if (decision.urgency === 'high') {
          await supabase
            .from('ghoste_campaigns')
            .update({ status: 'paused' })
            .eq('id', campaign.id);

          await triggerMailchimpAutomation({
            user_id: campaign.owner_user_id,
            campaign_id: campaign.id,
            automation_type: 'pause_notice',
            trigger_reason: 'urgent_creative_needed',
            recipient_email: campaign.notification_email,
            recipient_phone: campaign.notification_phone,
            delivery_method: campaign.notification_method === 'sms' ? 'sms' : 'email',
            body: generatePauseNotice(campaign.campaign_name, 'Performance too low. Need fresh content.'),
          });
        }

        const brief = await generateCreativeBrief(
          campaign.id,
          campaign.vibe_constraints || [],
          decision.reason
        );

        await createCreativeRequest(
          campaign.owner_user_id,
          campaign.id,
          brief,
          decision.reason,
          decision.urgency || 'normal'
        );

        const uploadLink = `${BASE_URL}/studio/run-ads?campaign_id=${campaign.id}&action=upload`;

        await triggerMailchimpAutomation({
          user_id: campaign.owner_user_id,
          campaign_id: campaign.id,
          automation_type: 'creative_request',
          trigger_reason: decision.reason,
          recipient_email: campaign.notification_email,
          recipient_phone: campaign.notification_phone,
          delivery_method: campaign.notification_method === 'sms' ? 'sms' : 'email',
          subject: 'Fresh content needed',
          body: generateCreativeRequestMessage(
            campaign.campaign_name,
            decision.urgency || 'normal',
            uploadLink
          ),
        });

        processed++;
        continue;
      }

      if (decision.action === 'spend_more' || decision.action === 'spend_less') {
        const { data: approval } = await supabase
          .from('ai_manager_approvals')
          .insert([{
            owner_user_id: campaign.owner_user_id,
            campaign_id: campaign.id,
            action_requested: decision.action,
            action_context: {
              recommended_budget: decision.recommended_budget_cents,
              confidence: decision.confidence,
              reason: decision.reason,
            },
            notification_method: campaign.notification_method,
            notification_body: decision.reason,
            response: 'pending',
            requires_user_action: true,
          }])
          .select()
          .single();

        if (!approval) {
          console.error('[ai-manager-daily-runner-v2] Failed to create approval');
          continue;
        }

        const approveLink = `${BASE_URL}/.netlify/functions/ai-approve-action?decision_id=${approval.id}`;
        const declineLink = `${BASE_URL}/.netlify/functions/ai-decline-action?decision_id=${approval.id}`;

        await supabase
          .from('ai_manager_approvals')
          .update({
            approval_link: approveLink,
            decline_link: declineLink,
          })
          .eq('id', approval.id);

        const recommendedBudgetDollars = (decision.recommended_budget_cents || 0) / 100;

        await triggerMailchimpAutomation({
          user_id: campaign.owner_user_id,
          campaign_id: campaign.id,
          approval_id: approval.id,
          automation_type: 'approval_request',
          trigger_reason: decision.reason,
          recipient_email: campaign.notification_email,
          recipient_phone: campaign.notification_phone,
          delivery_method: campaign.notification_method === 'sms' ? 'sms' : 'email',
          subject: decision.action === 'spend_more' ? 'Opportunity to scale' : 'Budget optimization',
          body: generateApprovalMessage(
            decision.action,
            campaign.campaign_name,
            recommendedBudgetDollars,
            approveLink,
            declineLink
          ),
        });

        processed++;
      }
    }

    console.log('[ai-manager-daily-runner-v2] ✅ Processed:', processed);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, processed }),
    };
  } catch (e: any) {
    console.error("[ai-manager-daily-runner-v2] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "runner_error" }),
    };
  }
};
