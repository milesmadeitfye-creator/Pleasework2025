import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/**
 * Universal Meta Event Tracker with Logging
 *
 * Sends events to Meta CAPI and logs all attempts to meta_event_logs table
 * This makes tracking visible and debuggable
 *
 * Usage: POST with { user_id, event_name, event_id, ... }
 */

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

async function getMetaConfig(userId: string): Promise<{
  pixel_id: string | null;
  capi_token: string | null;
  test_event_code: string | null;
}> {
  // Load from meta_credentials (primary source)
  const { data: creds } = await supabaseAdmin
    .from("meta_credentials")
    .select("pixel_id, conversion_api_token, test_event_code")
    .eq("user_id", userId)
    .maybeSingle();

  if (creds?.pixel_id && creds?.conversion_api_token) {
    return {
      pixel_id: creds.pixel_id,
      capi_token: creds.conversion_api_token,
      test_event_code: creds.test_event_code || null,
    };
  }

  // Fallback to user_profiles (old system)
  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("meta_pixel_id, meta_conversions_token")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    pixel_id: profile?.meta_pixel_id || null,
    capi_token: profile?.meta_conversions_token || null,
    test_event_code: null,
  };
}

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

  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const {
      user_id,
      event_name,
      event_id,
      event_source_url,
      action_source = "website",
      fbp,
      fbc,
      email,
      external_id,
      link_id,
      link_type,
      custom_data = {},
      test_mode = false,
    } = body;

    // Validate required fields
    if (!event_name || !event_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "missing_event_fields",
          message: "event_name and event_id are required",
        }),
      };
    }

    if (!user_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "missing_user_id",
          message: "user_id is required",
        }),
      };
    }

    // Load Meta configuration
    const cfg = await getMetaConfig(user_id);

    if (!cfg.pixel_id) {
      await supabaseAdmin.from("meta_event_logs").insert({
        user_id,
        event_name,
        event_id,
        source: "server",
        link_id,
        link_type,
        payload: body,
        meta_response: { error: "missing_pixel_id" },
        success: false,
        error_message: "No pixel_id configured for this user",
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: "missing_pixel_id",
          message: "Connect Meta in Settings to enable tracking",
        }),
      };
    }

    if (!cfg.capi_token) {
      await supabaseAdmin.from("meta_event_logs").insert({
        user_id,
        event_name,
        event_id,
        source: "server",
        pixel_id: cfg.pixel_id,
        link_id,
        link_type,
        payload: body,
        meta_response: { error: "missing_capi_token" },
        success: false,
        error_message: "No Conversions API token configured",
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: "missing_capi_token",
          message: "Generate Conversions API token in Meta Events Manager",
        }),
      };
    }

    // Build user_data with hashing
    const user_data: any = {};

    if (email) user_data.em = [sha256(email)];
    if (external_id) user_data.external_id = [sha256(external_id)];
    if (fbp) user_data.fbp = fbp;
    if (fbc) user_data.fbc = fbc;

    // Add server-side IP and User-Agent
    const ip =
      event.headers["x-nf-client-connection-ip"] ||
      event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      null;
    const ua = event.headers["user-agent"] || null;

    if (ip) user_data.client_ip_address = ip;
    if (ua) user_data.client_user_agent = ua;

    // Build CAPI payload
    const capiPayload: any = {
      data: [
        {
          event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id,
          action_source,
          event_source_url: event_source_url || undefined,
          user_data,
          custom_data,
        },
      ],
    };

    // Include test_event_code if available or in test_mode
    const testCode = test_mode ? "TEST62806" : cfg.test_event_code;
    if (testCode) {
      capiPayload.test_event_code = testCode;
    }

    // Send to Meta CAPI
    const url = `https://graph.facebook.com/v21.0/${cfg.pixel_id}/events?access_token=${encodeURIComponent(
      cfg.capi_token
    )}`;

    const metaResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capiPayload),
    });

    const metaJson = await metaResponse.json();
    const success = metaResponse.ok && !metaJson?.error;

    // Log to database
    await supabaseAdmin.from("meta_event_logs").insert({
      user_id,
      event_name,
      event_id,
      source: "capi",
      pixel_id: cfg.pixel_id,
      link_id,
      link_type,
      payload: capiPayload,
      meta_response: metaJson,
      success,
      error_message: success ? null : metaJson?.error?.message || "Unknown error",
    });

    console.log("[meta-track-event]", {
      event_name,
      event_id,
      success,
      pixel_id: cfg.pixel_id,
      test_code: testCode || null,
    });

    return {
      statusCode: success ? 200 : 500,
      headers,
      body: JSON.stringify({
        success,
        event_name,
        event_id,
        pixel_id: cfg.pixel_id,
        test_event_code: testCode || null,
        meta_response: metaJson,
      }),
    };
  } catch (e: any) {
    console.error("[meta-track-event] Error:", e);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: "server_error",
        message: e?.message || String(e),
      }),
    };
  }
};
