import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { makeDecision } from "./_aiDecisionEngine";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  const supabase = getSupabaseAdmin();

  const authHeader = event.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "unauthorized" }),
    };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "invalid_token" }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { campaign_id, action } = body;

    if (!campaign_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "missing_campaign_id" }),
      };
    }

    const { data: campaign, error: campaignError } = await supabase
      .from('ghoste_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .eq('owner_user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return {
        statusCode: 404,
        body: JSON.stringify({ ok: false, error: "campaign_not_found" }),
      };
    }

    if (!campaign.latest_score) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "no_score_available",
          message: "Campaign needs performance data before AI can take action",
        }),
      };
    }

    if (campaign.ai_mode === 'assist' && action) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "manual_mode",
          message: "Campaign is in Assist mode. AI cannot take automated actions.",
        }),
      };
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

    const context = {
      campaign_id: campaign.id,
      current_daily_budget: campaign.daily_budget_cents / 100,
      max_daily_budget: campaign.max_daily_budget_cents / 100,
      automation_mode: campaign.ai_mode as 'guided' | 'autonomous' | 'manual',
      days_running: daysRunning,
      total_spend: campaign.total_spend_cents / 100,
    };

    const decision = makeDecision(teacherScore, context);

    const allowed = campaign.ai_mode === 'autonomous' ||
      (campaign.ai_mode === 'guided' && action === decision.action);

    if (allowed && action) {
      switch (action) {
        case 'scale_up':
          if (decision.recommended_budget && decision.recommended_budget <= context.max_daily_budget) {
            await supabase
              .from('ghoste_campaigns')
              .update({
                daily_budget_cents: Math.round(decision.recommended_budget * 100),
              })
              .eq('id', campaign_id);

            console.log('[run-ads-control] ✅ Scaled budget to:', decision.recommended_budget);
          }
          break;

        case 'pause':
          await supabase
            .from('ghoste_campaigns')
            .update({ status: 'paused' })
            .eq('id', campaign_id);

          console.log('[run-ads-control] ⏸️ Paused campaign');
          break;

        case 'maintain':
          console.log('[run-ads-control] ✅ Maintaining current settings');
          break;

        default:
          console.log('[run-ads-control] ℹ️ Action requires manual implementation:', action);
      }

      await supabase
        .from('ai_operator_actions')
        .insert([{
          owner_user_id: user.id,
          entity_type: 'campaign',
          entity_id: campaign.meta_campaign_id || campaign_id,
          action_type: action,
          action_taken: true,
          reason: decision.reason,
          score_at_action: teacherScore.score,
          confidence_at_action: teacherScore.confidence,
          context: { decision, context },
        }]);
    }

    console.log('[run-ads-control] Decision:', {
      action: decision.action,
      allowed,
      mode: campaign.ai_mode,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        decision,
        allowed,
        action_taken: allowed && action,
        mode: campaign.ai_mode,
      }),
    };
  } catch (e: any) {
    console.error("[run-ads-control] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "control_error" }),
    };
  }
};
