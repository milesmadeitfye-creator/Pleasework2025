import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import { supabaseAdmin } from "./_supabaseAdmin";

const json = (statusCode: number, body: any) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  },
  body: JSON.stringify(body),
});

function getClientIp(event: any) {
  return (
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    null
  );
}

function sha256Lower(v: string) {
  return crypto.createHash("sha256").update(v.trim().toLowerCase()).digest("hex");
}

/**
 * Meta Conversions API (CAPI) tracking for Smart Links
 *
 * This sends server-side events to Meta that mirror client-side Pixel events.
 * Uses event_id for deduplication so events aren't counted twice.
 *
 * IMPORTANT: This does NOT replace or interfere with Pixel tracking.
 * Both Pixel and CAPI send events, Meta deduplicates using event_id.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // Required fields from Smart Link page
    const owner_user_id = String(body.owner_user_id || "");
    const event_name = String(body.event_name || "");
    const event_id = String(body.event_id || "");
    const event_source_url = String(body.event_source_url || "");

    // Optional fields
    const custom_data = body.custom_data || {};
    const fbp = body.fbp || null;
    const fbc = body.fbc || null;
    const email = body.email ? sha256Lower(String(body.email)) : null;

    if (!owner_user_id || !event_name || !event_id || !event_source_url) {
      return json(400, {
        ok: false,
        error: "Missing required fields",
        required: ["owner_user_id", "event_name", "event_id", "event_source_url"]
      });
    }

    console.log("[smartlink-capi-track] Processing CAPI event:", {
      owner_user_id,
      event_name,
      event_id: event_id.slice(0, 12) + "...",
    });

    // Pull Meta config from database
    const { data: meta, error: metaErr } = await supabaseAdmin
      .from("meta_credentials")
      .select("pixel_id, access_token, capi_enabled, test_event_code")
      .eq("user_id", owner_user_id)
      .eq("is_active", true)
      .maybeSingle();

    if (metaErr) {
      console.error("[smartlink-capi-track] Meta lookup error:", metaErr);
      return json(500, { ok: false, error: "Meta settings lookup failed", details: metaErr.message });
    }

    // If CAPI not enabled, skip silently
    if (!meta?.capi_enabled) {
      console.log("[smartlink-capi-track] CAPI disabled for user:", owner_user_id);
      return json(200, { ok: true, skipped: "capi_disabled" });
    }

    // If missing credentials, skip
    if (!meta?.pixel_id || !meta?.access_token) {
      console.log("[smartlink-capi-track] Missing pixel or token for user:", owner_user_id);
      return json(200, { ok: true, skipped: "missing_credentials" });
    }

    // Extract client data
    const client_ip_address = getClientIp(event);
    const client_user_agent = event.headers["user-agent"] || "";

    console.log("[smartlink-capi-track] Sending CAPI event to Meta:", {
      pixel_id: meta.pixel_id,
      event_name,
      has_test_code: !!meta.test_event_code,
    });

    // Extract value and currency from custom_data for top-level placement (Meta best practice)
    const value = custom_data?.value ?? 0.00;
    const currency = custom_data?.currency ?? 'USD';

    // Build CAPI payload
    const payload: any = {
      data: [
        {
          event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id, // CRITICAL: Same as Pixel for deduplication
          action_source: "website",
          event_source_url,
          user_data: {
            client_ip_address,
            client_user_agent,
            fbp,
            fbc,
            ...(email ? { em: [email] } : {}),
          },
          custom_data,
          // Include value/currency at top level to avoid Meta Diagnostics warnings
          value,
          currency,
        },
      ],
    };

    // Add test event code if configured
    if (meta.test_event_code) {
      payload.test_event_code = meta.test_event_code;
      console.log("[smartlink-capi-track] Using test event code:", meta.test_event_code);
    }

    // Send to Meta Conversions API
    const url = `https://graph.facebook.com/v18.0/${meta.pixel_id}/events?access_token=${meta.access_token}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseData = await res.json();

    if (!res.ok) {
      console.error("[smartlink-capi-track] Meta API error:", responseData);
      return json(500, {
        ok: false,
        error: "Meta CAPI request failed",
        details: responseData
      });
    }

    console.log("[smartlink-capi-track] CAPI event sent successfully:", responseData);

    return json(200, {
      ok: true,
      meta: responseData,
      event_id,
    });
  } catch (e: any) {
    console.error("[smartlink-capi-track] Error:", e);
    return json(500, {
      ok: false,
      error: e?.message || "Unknown error",
      stack: e?.stack,
    });
  }
};

export default handler;
