import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    // Check if Apple Music credentials are configured (read from app_secrets)
    const { data: secrets } = await supabase
      .from('app_secrets')
      .select('key')
      .in('key', ['APPLE_MUSIC_TEAM_ID', 'APPLE_MUSIC_KEY_ID', 'APPLE_MUSIC_PRIVATE_KEY_P8']);

    if (!secrets || secrets.length < 3) {
      return {
        statusCode: 503,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          message: "Apple Music credentials not configured in app_secrets"
        })
      };
    }

    console.log('[apple-music-metrics-sync] Stub: Would sync Apple Music metrics for user:', user.id);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        message: "Apple Music metrics sync ready (stub)",
        synced: false
      })
    };

  } catch (err: any) {
    console.error('[apple-music-metrics-sync] Error:', err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err?.message || "Internal server error"
      })
    };
  }
};
