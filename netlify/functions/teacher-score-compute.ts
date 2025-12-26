import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import {
  fetchGhosteSignals,
  fetchTeacherSignalEphemeral,
  computeTeacherScore,
  persistTeacherScore,
  type ScoreInput,
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

    const entity_type = body.entity_type || "campaign";
    const entity_id = body.entity_id;
    const platform = body.platform || undefined;
    const window_hours = body.window_hours || 24;

    if (!entity_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "missing_entity_id" }),
      };
    }

    const window_end = new Date();
    const window_start = new Date(window_end.getTime() - window_hours * 60 * 60 * 1000);

    console.log("[teacher-score] Computing score for:", {
      user_id: user.id,
      entity_type,
      entity_id,
      platform,
      window: `${window_start.toISOString()} -> ${window_end.toISOString()}`,
    });

    const signals = await fetchGhosteSignals(
      user.id,
      entity_type,
      entity_id,
      platform,
      window_start,
      window_end
    );

    console.log("[teacher-score] Ghoste signals:", {
      total_clicks: signals.total_clicks,
      platform_clicks: signals.platform_clicks,
      intent_depth: signals.intent_depth.toFixed(2),
    });

    const teacher = await fetchTeacherSignalEphemeral(
      user.id,
      entity_type,
      entity_id,
      platform,
      window_start,
      window_end
    );

    console.log("[teacher-score] Teacher signal:", teacher ? "received (ephemeral)" : "unavailable");

    const history: any[] = [];

    const result = computeTeacherScore(signals, teacher, history);

    console.log("[teacher-score] Computed score:", {
      score: result.score,
      grade: result.grade,
      confidence: result.confidence,
    });

    const input: ScoreInput = {
      owner_user_id: user.id,
      entity_type,
      entity_id,
      platform,
      window_start,
      window_end,
    };

    await persistTeacherScore(input, result);

    console.log("[teacher-score] ✅ Score persisted");

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
    console.error("[teacher-score] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "compute_error" }),
    };
  }
};
