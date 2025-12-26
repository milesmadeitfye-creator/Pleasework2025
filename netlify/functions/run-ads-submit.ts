import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { buildAndLaunchCampaign, RunAdsInput } from "./_runAdsCampaignBuilder";

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

    const {
      ad_goal,
      daily_budget_cents,
      automation_mode,
      creative_ids,
      total_budget_cents,
      smart_link_id,
      one_click_link_id,
      platform,
      profile_url,
      capture_page_url,
    } = body;

    if (!ad_goal || !daily_budget_cents || !automation_mode || !creative_ids || creative_ids.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "missing_required_fields" }),
      };
    }

    console.log('[run-ads-submit] Building campaign:', {
      ad_goal,
      daily_budget_cents,
      automation_mode,
      creative_count: creative_ids.length,
    });

    const input: RunAdsInput = {
      user_id: user.id,
      ad_goal,
      daily_budget_cents,
      automation_mode,
      creative_ids,
      total_budget_cents,
      smart_link_id,
      one_click_link_id,
      platform,
      profile_url,
      capture_page_url,
    };

    const result = await buildAndLaunchCampaign(input);

    if (!result.success) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: result.error || 'campaign_build_failed',
        }),
      };
    }

    console.log('[run-ads-submit] ✅ Campaign launched:', result.campaign_id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        campaign_id: result.campaign_id,
        campaign_type: result.campaign_type,
        reasoning: result.reasoning,
        confidence: result.confidence,
        guardrails_applied: result.guardrails_applied,
      }),
    };
  } catch (e: any) {
    console.error("[run-ads-submit] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "submit_error" }),
    };
  }
};
