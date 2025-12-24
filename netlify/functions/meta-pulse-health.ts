import type { Handler, HandlerEvent } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Meta Pulse Health Check
 *
 * Lightweight check to confirm Meta messaging connection is active
 * Used by Fan Pulse for status display
 */

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const userId = user.id;

    const { data: connection, error: connError } = await supabase
      .from("user_meta_connections")
      .select("access_token, meta_page_id, meta_page_name, meta_instagram_id, meta_instagram_username")
      .eq("user_id", userId)
      .maybeSingle();

    if (connError || !connection) {
      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          ok: false,
          status: "not_connected",
          message: "Meta account not connected",
        }),
      };
    }

    if (!connection.access_token) {
      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          ok: false,
          status: "no_token",
          message: "Meta access token missing",
        }),
      };
    }

    const platforms: { facebook: boolean; instagram: boolean } = {
      facebook: false,
      instagram: false,
    };

    if (connection.meta_page_id) {
      try {
        const pageResponse = await fetch(
          `https://graph.facebook.com/v18.0/${connection.meta_page_id}?fields=id,name&access_token=${connection.access_token}`
        );

        if (pageResponse.ok) {
          platforms.facebook = true;
        } else {
          console.warn("[meta-pulse-health] Facebook page check failed:", pageResponse.status);
        }
      } catch (error) {
        console.warn("[meta-pulse-health] Facebook check error:", error);
      }
    }

    if (connection.meta_instagram_id) {
      try {
        const igResponse = await fetch(
          `https://graph.facebook.com/v18.0/${connection.meta_instagram_id}?fields=id,username&access_token=${connection.access_token}`
        );

        if (igResponse.ok) {
          platforms.instagram = true;
        } else {
          console.warn("[meta-pulse-health] Instagram check failed:", igResponse.status);
        }
      } catch (error) {
        console.warn("[meta-pulse-health] Instagram check error:", error);
      }
    }

    const isConnected = platforms.facebook || platforms.instagram;

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        ok: true,
        status: isConnected ? "connected" : "not_connected",
        checked_at: new Date().toISOString(),
        platforms,
        accounts: {
          facebook: connection.meta_page_name || null,
          instagram: connection.meta_instagram_username || null,
        },
      }),
    };
  } catch (error: any) {
    console.error("[meta-pulse-health] Error:", error);
    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};

export { handler };
