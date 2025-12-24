import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Meta Smart Link Event Tracking
 * Fires CAPI events with per-user credentials from meta_credentials table
 * Supports Test Events via test_event_code
 * Includes diagnostics mode with ?debug=1
 */
export const handler: Handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const isDebug = event.queryStringParameters?.debug === "1";

  try {
    const body = JSON.parse(event.body || "{}");
    const {
      user_id,
      event_name,
      event_id,
      event_source_url,
      fbp,
      fbc,
      slug,
      link_id,
      track_title,
      platform,
      outbound_url,
    } = body;

    const diagnostics: any = {
      received: {
        user_id: !!user_id,
        event_name,
        event_id: !!event_id,
        has_fbp: !!fbp,
        has_fbc: !!fbc,
      },
    };

    if (!user_id) {
      return json(headers, {
        ok: false,
        error: "missing_user_id",
        diagnostics: isDebug ? diagnostics : undefined,
      });
    }

    if (!event_name) {
      return json(headers, {
        ok: false,
        error: "missing_event_name",
        diagnostics: isDebug ? diagnostics : undefined,
      });
    }

    // Load user's Meta credentials
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: credData, error: credError } = await supabase
      .from("meta_credentials")
      .select("pixel_id, conversion_api_token, test_event_code, capi_enabled")
      .eq("user_id", user_id)
      .maybeSingle();

    diagnostics.credentials = {
      found: !!credData,
      has_pixel_id: !!credData?.pixel_id,
      has_token: !!credData?.conversion_api_token,
      has_test_code: !!credData?.test_event_code,
      capi_enabled: credData?.capi_enabled,
      error: credError?.message,
    };

    if (!credData || !credData.pixel_id || !credData.conversion_api_token) {
      return json(headers, {
        ok: false,
        error: "missing_credentials",
        details: !credData
          ? "No meta_credentials row found"
          : !credData.pixel_id
          ? "pixel_id not set"
          : "conversion_api_token not set",
        diagnostics: isDebug ? diagnostics : undefined,
      });
    }

    if (credData.capi_enabled === false) {
      return json(headers, {
        ok: true,
        skipped: true,
        reason: "capi_disabled",
        diagnostics: isDebug ? diagnostics : undefined,
      });
    }

    // Get IP and User Agent from request headers
    const ip = (
      event.headers["x-forwarded-for"] ||
      event.headers["x-nf-client-connection-ip"] ||
      event.headers["client-ip"] ||
      ""
    )
      .toString()
      .split(",")[0]
      .trim();

    const ua = (event.headers["user-agent"] || "").toString();

    diagnostics.request = {
      ip: ip ? maskIP(ip) : null,
      ua: ua ? ua.substring(0, 50) + "..." : null,
    };

    // Build CAPI payload
    const event_time = Math.floor(Date.now() / 1000);
    const final_event_id = event_id || `sl_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const user_data: any = {
      client_ip_address: ip || undefined,
      client_user_agent: ua || undefined,
    };

    if (fbp) user_data.fbp = fbp;
    if (fbc) user_data.fbc = fbc;

    const custom_data: any = {
      content_name: track_title || slug,
      content_type: "smart_link",
    };

    if (slug) custom_data.slug = slug;
    if (link_id) custom_data.smart_link_id = link_id;
    if (platform) custom_data.platform = platform;
    if (outbound_url) custom_data.destination_url = outbound_url;

    const payload: any = {
      data: [
        {
          event_name,
          event_time,
          event_id: final_event_id,
          action_source: "website",
          event_source_url: event_source_url || `https://ghoste.one/s/${slug}`,
          user_data,
          custom_data,
        },
      ],
    };

    // HARD-WIRED: Always include test_event_code for Smart Links Test Events
    // This ensures CAPI events appear in Meta Test Events dashboard
    payload.test_event_code = "TEST62806";

    console.log("[meta-smartlink-event] HARD-WIRED test_event_code: TEST62806");

    diagnostics.payload = {
      pixel_id: credData.pixel_id,
      event_name,
      event_id: final_event_id,
      action_source: "website",
      has_test_code: true,
      test_code: "TEST62806", // HARD-WIRED for Smart Links
      user_data: {
        has_ip: !!ip,
        has_ua: !!ua,
        has_fbp: !!fbp,
        has_fbc: !!fbc,
      },
      custom_data: Object.keys(custom_data),
    };

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

    diagnostics.meta_response = {
      status: metaResponse.status,
      ok: metaResponse.ok,
      body: responseJson,
    };

    if (!metaResponse.ok) {
      console.error("[meta-smartlink-event] Meta API error:", {
        status: metaResponse.status,
        response: responseJson,
        pixel_id: credData.pixel_id,
        event_name,
      });

      return json(headers, {
        ok: false,
        error: "meta_api_error",
        status: metaResponse.status,
        response: responseJson,
        diagnostics: isDebug ? diagnostics : undefined,
      });
    }

    console.log("[meta-smartlink-event] Success:", {
      event_name,
      event_id: final_event_id,
      pixel_id: credData.pixel_id,
      test_event_code: "TEST62806",
    });

    return json(headers, {
      ok: true,
      event_name,
      event_id: final_event_id,
      pixel_id: credData.pixel_id,
      test_event_code: "TEST62806", // HARD-WIRED for Smart Links
      status: metaResponse.status,
      response: responseJson,
      diagnostics: isDebug ? diagnostics : undefined,
    });
  } catch (err: any) {
    console.error("[meta-smartlink-event] Error:", err);

    return json(headers, {
      ok: false,
      error: "catch",
      message: err.message || String(err),
      diagnostics: isDebug ? { error: err.stack } : undefined,
    });
  }
};

function json(headers: Record<string, string>, body: any) {
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(body),
  };
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.substring(0, 500) };
  }
}

function maskIP(ip: string): string {
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  return "xxx.xxx.xxx.xxx";
}
