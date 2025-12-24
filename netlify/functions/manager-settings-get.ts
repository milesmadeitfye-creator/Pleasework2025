import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

/**
 * Get manager settings for a user
 * GET /.netlify/functions/manager-settings-get?user_id=xxx
 */

const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const userId = event.queryStringParameters?.user_id;

    if (!userId) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: "user_id required" }),
      };
    }

    const supabase = getSupabaseAdmin();

    const { data: settings, error } = await supabase
      .from("manager_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("[manager-settings-get] error", error);
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Failed to fetch settings" }),
      };
    }

    // Return default if not found
    const result = settings || {
      user_id: userId,
      mode: "moderate",
      messages_per_day: 2,
      tokens_per_message: 6,
      mailchimp_enabled: false,
      sms_enabled: false,
      quiet_hours: {},
    };

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ok: true, settings: result }),
    };
  } catch (err: any) {
    console.error("[manager-settings-get] error", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message || "Internal error" }),
    };
  }
};

export { handler };
