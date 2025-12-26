import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

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
    const { campaign_id } = body;

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

    await supabase
      .from('ghoste_campaigns')
      .update({
        status: 'paused',
        automation_enabled: false,
        ai_mode: 'assist',
      })
      .eq('id', campaign_id);

    await supabase
      .from('ai_operator_actions')
      .insert([{
        owner_user_id: user.id,
        entity_type: 'campaign',
        entity_id: campaign.meta_campaign_id || campaign_id,
        action_type: 'emergency_stop',
        action_taken: true,
        reason: 'User triggered kill switch',
        score_at_action: campaign.latest_score || 0,
        confidence_at_action: 'user_override',
        context: {
          timestamp: new Date().toISOString(),
          previous_mode: campaign.ai_mode,
        },
      }]);

    console.log('[run-ads-kill-switch] 🛑 Campaign paused:', campaign_id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: 'Campaign paused and automation disabled',
      }),
    };
  } catch (e: any) {
    console.error("[run-ads-kill-switch] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "kill_switch_error" }),
    };
  }
};
