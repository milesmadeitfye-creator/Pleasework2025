import type { Handler } from "@netlify/functions";
import { json, cors } from "./_shared/response";
import { supabaseAdmin } from "./_supabaseAdmin";
import { getUserFromAuthHeader } from "./_shared/auth";

/**
 * Debug endpoint to verify AI video pipeline is working
 * Shows recent video_generations for authenticated user
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return cors();

  try {
    const user = await getUserFromAuthHeader(event.headers.authorization);

    // Allow unauthenticated access for debugging (service admin view)
    const includeAllUsers = !user && event.queryStringParameters?.admin === "true";

    let query = supabaseAdmin
      .from("video_generations")
      .select("id,user_id,title,prompt,model,status,progress,openai_job_id,output_video_url,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (user && !includeAllUsers) {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query;

    if (error) {
      return json(500, {
        ok: false,
        error: error.message,
        code: error.code,
      });
    }

    // Count by status
    const statusCounts = (data || []).reduce((acc: any, v: any) => {
      acc[v.status] = (acc[v.status] || 0) + 1;
      return acc;
    }, {});

    return json(200, {
      ok: true,
      user_id: user?.id || "admin",
      total: data?.length || 0,
      status_counts: statusCounts,
      videos: data || [],
    });
  } catch (err: any) {
    console.error("[ai-video-debug] Error:", err);
    return json(500, {
      ok: false,
      error: err.message || "Unknown error",
    });
  }
};

export default handler;
