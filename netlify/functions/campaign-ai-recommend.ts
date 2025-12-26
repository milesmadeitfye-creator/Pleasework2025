import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { makeDecision, logDecision } from "./_aiDecisionEngine";
import type { CampaignType } from "./_campaignTemplates";

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

    const campaign_id = body.campaign_id;

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
        body: JSON.stringify({ ok: false, error: "no_score_available", message: "Compute a score first" }),
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

    await logDecision(
      user.id,
      'campaign',
      campaign.meta_campaign_id || campaign.id,
      decision
    );

    console.log('[campaign-ai-recommend] ✅ Decision:', decision.action);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        decision,
        campaign_status: {
          score: campaign.latest_score,
          grade: campaign.latest_grade,
          confidence: campaign.latest_confidence,
          days_running: daysRunning,
        },
      }),
    };
  } catch (e: any) {
    console.error("[campaign-ai-recommend] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "recommend_error" }),
    };
  }
};
