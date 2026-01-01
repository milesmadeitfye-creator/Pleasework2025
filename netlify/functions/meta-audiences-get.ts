import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

/**
 * GET endpoint to retrieve existing Meta audiences for a user
 *
 * Returns all audiences created for the authenticated user,
 * with optional filtering by audience_type and status.
 *
 * Query params:
 * - audience_type: Filter by type (custom, lookalike, etc.)
 * - status: Filter by status (active, archived, etc.)
 *
 * Auth: Required (Bearer token)
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "Supabase not configured"
      }),
    };
  }

  // Auth
  const authHeader = event.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "unauthorized" }),
    };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "invalid_token" }),
    };
  }

  try {
    // Parse query params
    const params = event.queryStringParameters || {};
    const audienceType = params.audience_type || null;
    const status = params.status || null;

    // Build query
    let query = supabase
      .from("meta_audiences")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // Apply filters
    if (audienceType) {
      query = query.eq("audience_type", audienceType);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[meta-audiences-get] Query error:", error);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Failed to fetch audiences",
          message: error.message,
        }),
      };
    }

    console.log("[meta-audiences-get] Success:", {
      userId: user.id,
      count: data?.length || 0,
      filters: { audienceType, status },
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        audiences: data || [],
        count: data?.length || 0,
      }),
    };
  } catch (e: any) {
    console.error("[meta-audiences-get] Error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "server_error",
        message: e.message,
      }),
    };
  }
};
