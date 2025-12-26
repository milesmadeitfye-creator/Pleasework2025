import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import {
  fetchGhosteSignals,
  fetchTeacherSignalEphemeral,
  computeTeacherScore,
} from "./_teacherScoreCompute";

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
    const window_hours = body.window_hours || 24;

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

    const window_end = new Date();
    const window_start = new Date(window_end.getTime() - window_hours * 60 * 60 * 1000);

    console.log('[campaign-score-sync] Computing score for:', {
      campaign_id,
      campaign_type: campaign.campaign_type,
      window: `${window_start.toISOString()} -> ${window_end.toISOString()}`,
    });

    const signals = await fetchGhosteSignals(
      user.id,
      'campaign',
      campaign.meta_campaign_id || campaign_id,
      campaign.destination_platform,
      window_start,
      window_end
    );

    const teacher = await fetchTeacherSignalEphemeral(
      user.id,
      'campaign',
      campaign.meta_campaign_id || campaign_id,
      campaign.destination_platform,
      window_start,
      window_end
    );

    const history: any[] = [];

    const result = computeTeacherScore(signals, teacher, history);

    await supabase
      .from('ghoste_campaigns')
      .update({
        latest_score: result.score,
        latest_grade: result.grade,
        latest_confidence: result.confidence,
        score_updated_at: new Date().toISOString(),
      })
      .eq('id', campaign_id);

    await supabase
      .from('campaign_score_history')
      .insert([{
        campaign_id,
        score: result.score,
        grade: result.grade,
        confidence: result.confidence,
        reasons: result.reasons,
        window_start: window_start.toISOString(),
        window_end: window_end.toISOString(),
      }]);

    await supabase
      .from('teacher_scores')
      .insert([{
        owner_user_id: user.id,
        entity_type: 'campaign',
        entity_id: campaign.meta_campaign_id || campaign_id,
        platform: campaign.destination_platform || null,
        score: result.score,
        confidence: result.confidence,
        grade: result.grade,
        window_start: window_start.toISOString(),
        window_end: window_end.toISOString(),
        reasons: result.reasons,
      }]);

    console.log('[campaign-score-sync] ✅ Score synced:', {
      score: result.score,
      grade: result.grade,
      confidence: result.confidence,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        score: result.score,
        grade: result.grade,
        confidence: result.confidence,
        reasons: result.reasons,
      }),
    };
  } catch (e: any) {
    console.error("[campaign-score-sync] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "sync_error" }),
    };
  }
};
