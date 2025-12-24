import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  console.log("[split-negotiations] Request received:", event.httpMethod);

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  try {
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[split-negotiations] Missing or invalid authorization header");
      return jsonResponse(401, { error: "Not authenticated" });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = getSupabaseAdmin();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[split-negotiations] Auth verification failed", authError);
      return jsonResponse(401, { error: "Not authenticated" });
    }

    console.log("[split-negotiations] User verified:", user.id.substring(0, 8) + "...");

    if (event.httpMethod === "GET") {
      console.log("[split-negotiations] Fetching negotiations for user:", user.id);

      const { data: negotiations, error: fetchError } = await supabase
        .from("split_negotiations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("[split-negotiations] Error fetching negotiations:", fetchError);
        return jsonResponse(500, {
          error: "Failed to fetch negotiations",
          details: fetchError.message,
        });
      }

      console.log("[split-negotiations] Found negotiations:", negotiations?.length || 0);
      return jsonResponse(200, {
        success: true,
        negotiations: negotiations || [],
      });
    }

    if (event.httpMethod === "POST") {
      let payload: any = {};
      try {
        payload = JSON.parse(event.body || "{}");
      } catch (err) {
        console.error("[split-negotiations] Invalid JSON payload");
        return jsonResponse(400, { error: "Invalid JSON payload" });
      }

      const projectName = payload.projectName || payload.project_name || payload.projectTitle || payload.project_title;
      const advanceAmount = payload.advanceAmount || payload.advance_amount;
      const beatFee = payload.beatFee || payload.beat_fee;
      const notes = payload.notes || null;

      if (!projectName || typeof projectName !== "string" || !projectName.trim()) {
        console.error("[split-negotiations] Missing or invalid project name");
        return jsonResponse(400, {
          error: "Missing required field: projectName",
          details: "Project name must be a non-empty string",
        });
      }

      console.log("[split-negotiations] Creating negotiation:", {
        user: user.id.substring(0, 8) + "...",
        projectName: projectName.trim(),
        advanceAmount,
        beatFee,
      });

      const { data, error: insertError } = await supabase
        .from("split_negotiations")
        .insert({
          user_id: user.id,
          project_name: projectName.trim(),
          status: "draft",
          total_percentage: 100,
          advance_amount: advanceAmount ? Number(advanceAmount) : null,
          beat_fee: beatFee ? Number(beatFee) : null,
        })
        .select("*")
        .single();

      if (insertError) {
        console.error("[split-negotiations] Error inserting negotiation:", insertError);
        return jsonResponse(500, {
          error: "Failed to create negotiation",
          details: insertError.message,
          code: insertError.code,
          hint: insertError.hint,
        });
      }

      console.log("[split-negotiations] Negotiation created successfully:", data.id);
      return jsonResponse(200, {
        success: true,
        negotiation: data,
      });
    }

    return jsonResponse(405, { error: "Method not allowed" });
  } catch (err: any) {
    console.error("[split-negotiations] Unexpected error:", err);
    return jsonResponse(500, {
      error: "Unexpected server error",
      details: err?.message || String(err),
    });
  }
};
