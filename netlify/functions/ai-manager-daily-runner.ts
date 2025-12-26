import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { decideManagerAction, requestApproval } from "./_aiManagerThreeActions";
import { checkCampaignForFatigue } from "./_creativeFatigueDetector";
import { generateCreativeBrief, createCreativeRequest } from "./_creativeBriefGenerator";

export const handler: Handler = async (event) => {
  const supabase = getSupabaseAdmin();

  try {
    const { data: campaigns } = await supabase
      .from('ghoste_campaigns')
      .select('*')
      .eq('manager_mode_enabled', true)
      .in('status', ['active', 'live']);

    if (!campaigns || campaigns.length === 0) {
      console.log('[ai-manager-daily-runner] No active manager campaigns');
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, processed: 0 }),
      };
    }

    let processed = 0;

    for (const campaign of campaigns) {
      const lastNotificationHours = campaign.last_notification_at
        ? (Date.now() - new Date(campaign.last_notification_at).getTime()) / (1000 * 60 * 60)
        : 999;

      if (lastNotificationHours < 24 && campaign.silence_is_good) {
        console.log('[ai-manager-daily-runner] ⏭️ Skip (recently notified):', campaign.id);
        continue;
      }

      if (!campaign.latest_score) {
        console.log('[ai-manager-daily-runner] ⏭️ Skip (no score yet):', campaign.id);
        continue;
      }

      const teacherScore = {
        score: campaign.latest_score,
        grade: campaign.latest_grade as 'fail' | 'weak' | 'pass' | 'strong',
        confidence: campaign.latest_confidence as 'low' | 'medium' | 'high',
        reasons: [],
        created_at: campaign.score_updated_at,
      };

      const startDate = campaign.created_at ? new Date(campaign.created_at) : new Date();
      const daysRunning = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      const creativeIds = campaign.config?.creative_ids || [];

      const context = {
        campaign_id: campaign.id,
        current_daily_budget: campaign.daily_budget_cents / 100,
        max_daily_budget: campaign.max_daily_budget_cents / 100,
        manager_mode_enabled: true,
        days_running: daysRunning,
        total_spend: campaign.total_spend_cents / 100,
        creatives_count: creativeIds.length,
      };

      const decision = decideManagerAction(teacherScore, context);

      console.log('[ai-manager-daily-runner] Decision:', campaign.id, decision.action);

      if (decision.action === 'none') {
        continue;
      }

      if (decision.action === 'make_more_creatives') {
        if (decision.urgency === 'high') {
          await supabase
            .from('ghoste_campaigns')
            .update({ status: 'paused' })
            .eq('id', campaign.id);
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

        const message = decision.urgency === 'high'
          ? `Hey, the videos for ${campaign.campaign_name} aren't landing. I paused the ads to protect your budget. Can you send me 2-3 new clips? I just created a brief for you.`
          : `Hey, ${campaign.campaign_name} could use some fresh content. Got 2-3 new videos you could shoot? I just created a brief for you.`;

        await supabase
          .from('ai_manager_notifications')
          .insert([{
            owner_user_id: campaign.owner_user_id,
            campaign_id: campaign.id,
            notification_type: 'creative_request',
            notification_method: campaign.notification_method,
            recipient_phone: campaign.notification_phone,
            recipient_email: campaign.notification_email,
            body: message,
            tone: 'casual',
            expects_reply: false,
          }]);

        await supabase
          .from('ghoste_campaigns')
          .update({ last_notification_at: new Date().toISOString() })
          .eq('id', campaign.id);

        processed++;
        continue;
      }

      if (decision.requires_approval) {
        await requestApproval(
          campaign.owner_user_id,
          campaign.id,
          decision,
          campaign.notification_method,
          {
            phone: campaign.notification_phone,
            email: campaign.notification_email,
          }
        );

        await supabase
          .from('ghoste_campaigns')
          .update({ last_notification_at: new Date().toISOString() })
          .eq('id', campaign.id);

        processed++;
      }
    }

    console.log('[ai-manager-daily-runner] ✅ Processed:', processed);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, processed }),
    };
  } catch (e: any) {
    console.error("[ai-manager-daily-runner] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "runner_error" }),
    };
  }
};
