import type { Handler } from "@netlify/functions";
import { createHash } from "crypto";
import { corsHeaders } from "./_headers";
import { getMetaConfig } from "./_metaConfig";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Facebook Conversions API - Server-Side Event Tracking
 *
 * Sends conversion events to Meta's Conversions API for improved tracking accuracy
 * and attribution when browser-based tracking (pixel) is blocked or incomplete.
 *
 * Configuration: Edit pixel ID and token in netlify/functions/_metaConfig.ts (lines 6-7)
 */

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    // Get Meta credentials from centralized config
    const { META_PIXEL_ID, META_CONVERSIONS_TOKEN, META_API_VERSION } = getMetaConfig();

    if (!META_PIXEL_ID || !META_CONVERSIONS_TOKEN) {
      console.error("[Meta Conversion] Missing credentials");
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Pixel ID or Token missing" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const {
      event_name,
      event_id,
      event_source_url,
      action_source = "website",
      value,
      currency,
      test_event_code,
      user_data = {},
    } = body;

    if (!event_name) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "event_name is required" }),
      };
    }

    // Hash helper function
    const hash = (value: string): string => {
      return createHash("sha256").update(value).digest("hex");
    };

    // Auto-detect client IP from Netlify headers if not provided
    const headers = event.headers || {};
    const inferredIp =
      user_data.client_ip_address ||
      headers["x-nf-client-connection-ip"] ||
      headers["x-forwarded-for"] ||
      headers["client-ip"];

    // Build hashed user data for privacy
    const hashedUserData: any = {};

    if (user_data.email) {
      hashedUserData.em = [hash(user_data.email.trim().toLowerCase())];
    }

    if (user_data.phone) {
      const cleanPhone = user_data.phone.replace(/\D/g, "");
      hashedUserData.ph = [hash(cleanPhone)];
    }

    if (inferredIp) {
      hashedUserData.client_ip_address = inferredIp;
    }

    if (user_data.client_user_agent) {
      hashedUserData.client_user_agent = user_data.client_user_agent;
    }

    if (user_data.fbp) hashedUserData.fbp = user_data.fbp;
    if (user_data.fbc) hashedUserData.fbc = user_data.fbc;

    // Build conversion event payload
    const payload = {
      data: [
        {
          event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id: event_id || `${event_name}_${Date.now()}_${Math.random()}`,
          event_source_url: event_source_url || "https://ghoste.one",
          action_source,
          user_data: hashedUserData,
          custom_data: value
            ? {
                value,
                currency: currency || "USD",
              }
            : undefined,
        },
      ],
    };

    // Build Graph API URL with optional test event code
    let url = `https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events?access_token=${META_CONVERSIONS_TOKEN}`;
    if (test_event_code) {
      url += `&test_event_code=${encodeURIComponent(test_event_code)}`;
      console.log(`[Meta Conversion] Sending ${event_name} TEST event to pixel ${META_PIXEL_ID}`);
    } else {
      console.log(`[Meta Conversion] Sending ${event_name} event to pixel ${META_PIXEL_ID}`);
    }

    // Send to Meta Conversions API
    const fbRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const fbJson = await fbRes.json();

    if (!fbRes.ok) {
      console.error("[Meta Conversion] API error:", fbRes.status, fbJson);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Meta Conversions API error",
          status: fbRes.status,
          fb_response: fbJson,
          message: fbJson?.error?.message || "Unknown error from Meta Graph API",
        }),
      };
    }

    if (test_event_code) {
      console.log(`[Meta Conversion] ✅ ${event_name} TEST event sent successfully`);
    } else {
      console.log(`[Meta Conversion] ✅ ${event_name} event sent successfully`);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        event_name,
        test_mode: !!test_event_code,
        fb_response: fbJson,
      }),
    };
  } catch (err: any) {
    console.error("[Meta Conversion] Function error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Server error",
        message: err?.message || String(err),
      }),
    };
  }
};
