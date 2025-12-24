import type { Handler } from "@netlify/functions";

/**
 * Meta Conversions API for Smart Links
 * Fires server-side events to complement client-side Pixel tracking
 * Must NEVER block user flow - all errors are swallowed
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const event_name = String(body.event_name || "ViewContent");
    const event_id = String(body.event_id || "");
    const smart_link_id = String(body.smart_link_id || "");
    const event_source_url =
      String(body.event_source_url || "") ||
      (smart_link_id ? `https://ghoste.one/s/${smart_link_id}` : "https://ghoste.one");

    const pixelId = process.env.META_PIXEL_ID || process.env.VITE_META_PIXEL_ID;
    const accessToken =
      process.env.META_CAPI_ACCESS_TOKEN ||
      process.env.META_CONVERSIONS_API_TOKEN ||
      process.env.VITE_META_CAPI_ACCESS_TOKEN;

    const testCode =
      process.env.META_TEST_EVENT_CODE ||
      process.env.VITE_META_TEST_EVENT_CODE;

    if (!pixelId || !accessToken || !event_id) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skipped: true,
          reason: !pixelId ? "missing_pixel" : !accessToken ? "missing_token" : "missing_event_id",
        }),
      };
    }

    const ip =
      (event.headers["x-forwarded-for"] || event.headers["x-nf-client-connection-ip"] || "")
        .toString()
        .split(",")[0]
        .trim();

    const ua = (event.headers["user-agent"] || "").toString();

    const payload: any = {
      data: [
        {
          event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id,
          action_source: "website",
          event_source_url,
          user_data: {
            client_ip_address: ip || undefined,
            client_user_agent: ua || undefined,
          },
          custom_data: {
            smart_link_id: smart_link_id || undefined,
          },
        },
      ],
    };

    if (testCode) payload.test_event_code = testCode;

    const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(
      accessToken
    )}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: resp.ok,
        status: resp.status,
        meta: safeJson(text),
      }),
    };
  } catch (err: any) {
    console.error("smartlink-capi error:", err);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false }),
    };
  }
};

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text?.slice?.(0, 500) || "" };
  }
}
