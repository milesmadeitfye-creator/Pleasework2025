import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import { resolveMetaTrackingForLink } from "./_lib/metaTrackingConfig";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input.trim().toLowerCase()).digest("hex");
}

function ipFromEvent(event: any) {
  return (
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.headers["client-ip"] ||
    null
  );
}

export const handler: Handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { userId, linkType, linkId, eventName, eventId, customData, userData } = body;

    if (!userId || !linkType || !linkId || !eventName || !eventId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields: userId, linkType, linkId, eventName, eventId" }),
      };
    }

    // Resolve tracking config from user settings + link overrides
    const cfg = await resolveMetaTrackingForLink({ userId, linkType, linkId });

    // Skip if CAPI disabled or missing config
    if (!cfg.capiEnabled || !cfg.pixelId || !cfg.capiToken) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          skipped: true,
          reason: "CAPI disabled or missing config",
        }),
      };
    }

    const clientIp = ipFromEvent(event);
    const userAgent = event.headers["user-agent"] || null;

    // Hash PII server-side (Meta best practice)
    const ud: any = {};
    if (userData?.email) ud.em = [sha256(userData.email)];
    if (userData?.phone) ud.ph = [sha256(userData.phone)];
    if (userData?.fn) ud.fn = [sha256(userData.fn)];
    if (userData?.ln) ud.ln = [sha256(userData.ln)];

    // Optional: external_id if you have a visitor/session/user id (hashed)
    if (userData?.external_id) ud.external_id = [sha256(userData.external_id)];

    // Meta recommends at least one of: em, ph, external_id
    ud.client_ip_address = clientIp;
    ud.client_user_agent = userAgent;

    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId, // Deduplication key (same as Pixel event_id)
          action_source: "website",
          event_source_url: body.eventSourceUrl || null,
          user_data: ud,
          custom_data: customData || {},
        },
      ],
      ...(cfg.testEventCode ? { test_event_code: cfg.testEventCode } : {}),
    };

    const url = `https://graph.facebook.com/v18.0/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.capiToken)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("[meta-capi] Error:", res.status, json);
      return {
        statusCode: 200, // Don't break UI
        body: JSON.stringify({
          ok: false,
          capiError: true,
          status: res.status,
          response: json,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        response: json,
      }),
    };
  } catch (e: any) {
    console.error("[meta-capi] Exception:", e);
    return {
      statusCode: 200, // Don't break UI
      body: JSON.stringify({
        ok: false,
        error: e?.message || "CAPI error",
      }),
    };
  }
};
