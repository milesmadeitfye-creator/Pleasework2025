import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { parseUA, guessStorefront, hashIp, smallAppOpenHTML } from "./_clickUtil";
import { getFbpFbc } from "./_cookie";
import { sendCapi } from "./_capi";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function parsePath(path: string) {
  const parts = path.split("/").filter(Boolean);
  const i = parts.indexOf("l");
  if (i === -1 || !parts[i+1] || !parts[i+2]) return null;
  return { track_id: parts[i+1], platform: parts[i+2].toLowerCase() };
}

export const handler: Handler = async (event) => {
  try {
    const info = parsePath(event.path || "");
    if (!info) return { statusCode: 400, body: "Bad shortlink" };
    const { track_id, platform } = info;

    const { data: linkRow, error } = await supabase
      .from("public_track_links")
      .select("platform, platform_id, url_web, storefront")
      .eq("track_id", track_id)
      .eq("platform", platform)
      .maybeSingle();

    if (error || !linkRow?.url_web) {
      return { statusCode: 404, body: "Link not found" };
    }

    const ua = event.headers["user-agent"] || "";
    const ref = event.headers["referer"] || event.headers["referrer"] || "";
    const ip =
      event.headers["x-nf-client-connection-ip"] ||
      event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      "";
    const { device, os, browser, isAndroid, isiOS } = parseUA(ua);
    const storefront = linkRow.storefront || guessStorefront(event.headers["accept-language"]);

    const universal = linkRow.url_web;
    const wantsAppHTML = (platform === "spotify" && (isiOS || isAndroid)) || (platform === "apple" && (isiOS || isAndroid));

    const target_url = universal;
    const result = wantsAppHTML ? "fallback" : "redirect";
    const was_app_attempt = wantsAppHTML;

    supabase.from("click_events").insert({
      track_id,
      platform,
      referrer: ref?.slice(0, 512),
      user_agent: ua?.slice(0, 1024),
      ip_hash: hashIp(ip || "", process.env.IP_HASH_SALT),
      country: storefront,
      storefront,
      device,
      os,
      browser,
      was_app_attempt,
      result,
      target_url
    }).then(() => {});

    const { data: ownerPixel } = await supabase
      .from("track_owners")
      .select("user_id, user_profiles!inner(meta_pixel_id)")
      .eq("track_id", track_id)
      .limit(1);
    const pixelId = (ownerPixel?.[0] as any)?.user_profiles?.meta_pixel_id as string | undefined;
    const accessToken = process.env.META_PIXEL_ACCESS_TOKEN as string | undefined;
    const testEventCode = process.env.META_PIXEL_TEST_CODE as string | undefined;

    if (pixelId && accessToken) {
      const { fbp, fbc } = getFbpFbc(event.headers as any);
      const externalId = (track_id || "") && (hashIp(track_id, process.env.IP_HASH_SALT) || null);
      const eventSourceUrl = (event.headers["x-forwarded-proto"] || "https") +
        "://" + (event.headers["x-forwarded-host"] || event.headers.host) + (event.path || "");

      sendCapi({
        pixelId,
        accessToken,
        testEventCode,
        eventName: "GhosteLinkClick",
        eventSourceUrl,
        clientIp: ip || null,
        clientUa: ua || null,
        fbp: fbp || null,
        fbc: fbc || null,
        externalId,
        customData: {
          platform,
          storefront,
          track_id,
        }
      });
    }

    if (wantsAppHTML) {
      const html = smallAppOpenHTML(platform, linkRow.platform_id, universal);
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control":"no-store" },
        body: html
      };
    }

    return {
      statusCode: 302,
      headers: { Location: universal, "Cache-Control":"no-store" },
      body: ""
    };
  } catch (e: any) {
    return { statusCode: 500, body: e.message || "Internal error" };
  }
};
