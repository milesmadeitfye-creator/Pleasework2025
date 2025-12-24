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
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: okHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const { track_id, confirm } = JSON.parse(event.body || "{}");
    if (!track_id || typeof confirm !== "boolean") {
      return { statusCode: 400, headers: okHeaders, body: JSON.stringify({ error: "track_id and confirm required" }) };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    let userId: string | null = null;
    if (token) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const { data: userRes } = await admin.auth.getUser(token);
      userId = userRes?.user?.id ?? null;
    }

    if (confirm) {
      const { error: e1 } = await supabase.from("public_tracks")
        .update({ user_confirmed: true, confirmed_by: userId, confirmed_at: new Date().toISOString() })
        .eq("id", track_id);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("public_track_links")
        .update({ confirmed: true })
        .eq("track_id", track_id)
        .gte("confidence", 0.9);
      if (e2) throw e2;
    } else {
      const { error: e3 } = await supabase.from("public_track_links")
        .update({ confirmed: false, confidence: 0.0, last_checked_status: 491 })
        .eq("track_id", track_id);
      if (e3) throw e3;

      try {
        const origin = event.headers["x-forwarded-host"] || event.headers.host;
        const scheme = (event.headers["x-forwarded-proto"] as string) || "https";
        await fetch(`${scheme}://${origin}/.netlify/functions/verify-links?track_id=${track_id}`);
      } catch {}
    }

    return { statusCode: 200, headers: okHeaders, body: JSON.stringify({ ok: true }) };
  } catch (e: any) {
    console.error("[confirm-release] Error:", e);
    return { statusCode: 500, headers: okHeaders, body: JSON.stringify({ error: e.message || "Internal error" }) };
  }
};
