import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const okHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: okHeaders, body: "" };

  try {
    if (event.httpMethod !== "POST")
      return { statusCode: 405, headers: okHeaders, body: JSON.stringify({ error: "Method not allowed" }) };

    const { track_id, platform, reason } = JSON.parse(event.body || "{}");
    if (!track_id || !platform)
      return { statusCode: 400, headers: okHeaders, body: JSON.stringify({ error: "track_id and platform required" }) };

    // Find the link row
    const { data: link, error: findErr } = await supabase
      .from("public_track_links")
      .select("id, url_web, confidence")
      .eq("track_id", track_id)
      .eq("platform", platform)
      .maybeSingle();

    if (findErr || !link)
      return { statusCode: 404, headers: okHeaders, body: JSON.stringify({ error: "Link not found" }) };

    // Lower confidence slightly and mark for recheck
    await supabase
      .from("public_track_links")
      .update({
        confidence: Math.max(0, Number(link.confidence) - 0.2),
        last_checked_status: 490,
        last_verified_at: new Date().toISOString(),
      })
      .eq("id", link.id);

    // Trigger a targeted verify run (fire-and-forget)
    const origin = event.headers["x-forwarded-host"] || event.headers.host;
    const scheme = (event.headers["x-forwarded-proto"] as string) || "https";
    fetch(`${scheme}://${origin}/.netlify/functions/verify-links?track_id=${track_id}`).catch(() => {});

    return {
      statusCode: 200,
      headers: okHeaders,
      body: JSON.stringify({ ok: true, reason: reason || "user_report" }),
    };
  } catch (e: any) {
    console.error("[report-link] Error:", e);
    return { statusCode: 500, headers: okHeaders, body: JSON.stringify({ error: e.message || "Internal error" }) };
  }
};
