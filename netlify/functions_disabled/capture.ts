import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { parseUA } from "./_clickUtil";
import { getFbpFbc } from "./_cookie";
import { sendCapi } from "./_capi";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ok = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function e164(phone: string) {
  const d = phone.replace(/[^\d+]/g, "");
  return d.startsWith("+") ? d : `+${d}`;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: ok, body: "" };
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, headers: ok, body: JSON.stringify({ error: "Method not allowed" }) };

    const { link_id, email, phone, consent_email, consent_sms } = JSON.parse(event.body || "{}");
    if (!link_id || (!email && !phone)) {
      return { statusCode: 400, headers: ok, body: JSON.stringify({ error: "link_id and email or phone required" }) };
    }

    const { data: link } = await supabase
      .from("marketing_links")
      .select("id, owner_id, type, pixel_enabled, capi_enabled")
      .eq("id", link_id).maybeSingle();

    if (!link) return { statusCode: 404, headers: ok, body: JSON.stringify({ error: "Link not found" }) };

    const ua = event.headers["user-agent"] || "";
    const { device, os, browser } = parseUA(ua);
    const ip = event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "";

    const { data: fan } = await supabase
      .from("fan_contacts")
      .insert({
        owner_id: link.owner_id,
        source_link_id: link.id,
        email: email || null,
        phone_e164: phone ? e164(phone) : null,
        consent_email: !!consent_email,
        consent_sms: !!consent_sms,
        meta: { device, os, browser }
      })
      .select("id, owner_id")
      .single();

    if (link.capi_enabled) {
      const { data: ownerProfile } = await supabase
        .from("user_profiles")
        .select("meta_pixel_id")
        .eq("user_id", link.owner_id)
        .maybeSingle();

      const pixelId = ownerProfile?.meta_pixel_id as string | undefined;
      const accessToken = process.env.META_PIXEL_ACCESS_TOKEN as string | undefined;
      const testEventCode = process.env.META_PIXEL_TEST_CODE as string | undefined;

      if (pixelId && accessToken) {
        const { fbp, fbc } = getFbpFbc(event.headers as any);
        const scheme = (event.headers["x-forwarded-proto"] as string) || "https";
        const host = (event.headers["x-forwarded-host"] as string) || event.headers.host;
        const eventSourceUrl = `${scheme}://${host}/x/${link_id}`;

        sendCapi({
          pixelId,
          accessToken,
          testEventCode,
          eventName: "GhosteLeadCapture",
          eventSourceUrl,
          clientIp: ip,
          clientUa: ua,
          fbp: fbp || null,
          fbc: fbc || null,
          externalId: fan?.id || null,
          customData: {
            link_id,
            type: link.type,
            channel: email ? "email" : "sms"
          }
        }).then(() => {}).catch(() => {});
      }
    }

    return { statusCode: 200, headers: ok, body: JSON.stringify({ ok: true, contact_id: fan?.id }) };
  } catch (e: any) {
    return { statusCode: 500, headers: ok, body: JSON.stringify({ error: e.message || "Internal error" }) };
  }
};
