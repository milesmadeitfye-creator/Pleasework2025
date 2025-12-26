import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
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
    const params = event.queryStringParameters || {};
    const entity_type = params.entity_type;
    const entity_id = params.entity_id;
    const platform = params.platform;

    let query = supabase
      .from('latest_teacher_scores')
      .select('*')
      .eq('owner_user_id', user.id);

    if (entity_type) {
      query = query.eq('entity_type', entity_type);
    }

    if (entity_id) {
      query = query.eq('entity_id', entity_id);
    }

    if (platform) {
      query = query.eq('platform', platform);
    }

    query = query.order('created_at', { ascending: false });

    const { data: scores, error } = await query;

    if (error) {
      throw error;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        scores: scores || [],
      }),
    };
  } catch (e: any) {
    console.error("[teacher-score-read] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "read_error" }),
    };
  }
};
