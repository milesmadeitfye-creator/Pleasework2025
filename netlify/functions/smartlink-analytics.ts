import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);

const json = (statusCode: number, body: any) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  },
  body: JSON.stringify(body),
});

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  try {
    const authHeader = event.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { ok: false, error: "Unauthorized - Missing Bearer token" });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);

    if (userErr || !userData?.user) {
      return json(401, { ok: false, error: "Unauthorized - Invalid token" });
    }

    const owner_user_id = userData.user.id;

    const url = new URL(event.rawUrl);
    const smartlink_id = url.searchParams.get("smartlink_id");
    const days = Math.min(Number(url.searchParams.get("days") || 30), 90);

    if (!smartlink_id) {
      return json(400, { ok: false, error: "Missing smartlink_id query parameter" });
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("smartlink_daily_rollups")
      .select("*")
      .eq("smartlink_id", smartlink_id)
      .eq("owner_user_id", owner_user_id)
      .gte("day", since)
      .order("day", { ascending: true });

    if (error) {
      console.error("[smartlink-analytics] Query failed:", error);
      return json(500, { ok: false, error: error.message });
    }

    return json(200, { ok: true, rows: data || [] });
  } catch (e: any) {
    console.error("[smartlink-analytics] Error:", e);
    return json(500, { ok: false, error: e?.message || "Unknown error" });
  }
};
