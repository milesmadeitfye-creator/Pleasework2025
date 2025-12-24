import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Meta Test Ping Endpoint
 * Self-test endpoint to verify Meta CAPI configuration
 * Returns Meta API response for diagnostics
 */
export const handler: Handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const { user_id } = event.queryStringParameters || {};

    if (!user_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "missing_user_id",
          message: "Query parameter 'user_id' is required",
        }),
      };
    }

    // Load user's Meta credentials
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: credData, error: credError } = await supabase
      .from("meta_credentials")
      .select("pixel_id, conversion_api_token, test_event_code, capi_enabled")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!credData) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "no_credentials",
          message: "No Meta credentials found for this user",
          user_id,
        }),
      };
    }

    if (!credData.pixel_id || !credData.conversion_api_token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "incomplete_credentials",
          message: "Missing pixel_id or conversion_api_token",
          has_pixel_id: !!credData.pixel_id,
          has_token: !!credData.conversion_api_token,
        }),
      };
    }

    // Build test event payload
    const event_time = Math.floor(Date.now() / 1000);
    const event_id = `test_ping_${Date.now()}`;

    const payload: any = {
      data: [
        {
          event_name: "TestPing",
          event_time,
          event_id,
          action_source: "website",
          event_source_url: "https://ghoste.one/test",
          user_data: {
            client_ip_address: event.headers["x-forwarded-for"]?.split(",")[0] || "0.0.0.0",
            client_user_agent: event.headers["user-agent"] || "test",
          },
          custom_data: {
            content_name: "Meta CAPI Test",
            test: true,
          },
        },
      ],
    };

    // HARD-WIRED: Always include test_event_code for Smart Links Test Events
    payload.test_event_code = "TEST62806";

    console.log("[meta-test-ping] HARD-WIRED test_event_code: TEST62806");

    // Send to Meta CAPI
    const url = `https://graph.facebook.com/v21.0/${credData.pixel_id}/events?access_token=${encodeURIComponent(
      credData.conversion_api_token
    )}`;

    const metaResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseText = await metaResponse.text();
    const responseJson = safeJson(responseText);

    if (!metaResponse.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: false,
          stage: "meta_api_error",
          status: metaResponse.status,
          pixel_id: credData.pixel_id,
          has_test_code: true,
          test_event_code: "TEST62806", // HARD-WIRED
          event_id,
          meta_response: responseJson,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: "Test ping sent successfully",
        pixel_id: credData.pixel_id,
        has_test_code: true,
        test_event_code: "TEST62806", // HARD-WIRED
        event_id,
        status: metaResponse.status,
        meta_response: responseJson,
      }),
    };
  } catch (err: any) {
    console.error("[meta-test-ping] Error:", err);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: "internal_error",
        message: err.message || String(err),
      }),
    };
  }
};

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.substring(0, 500) };
  }
}
