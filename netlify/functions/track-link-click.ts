import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function resp(statusCode: number, body: any) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return resp(200, { ok: true });
    if (event.httpMethod !== "POST") return resp(405, { ok: false, error: "Method not allowed" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = event.body ? JSON.parse(event.body) : {};
    const {
      owner_user_id,
      link_id,
      link_type = "smart_link",
      platform,
      slug = null,
      url = null,
      referrer = null,
      metadata = null,
    } = body;

    if (!owner_user_id) return resp(400, { ok: false, error: "owner_user_id required" });
    if (!platform) return resp(400, { ok: false, error: "platform required" });

    const { data, error } = await supabase
      .from("link_click_events")
      .insert([
        {
          owner_user_id,
          link_id: link_id ?? null,
          link_type,
          platform,
          slug,
          url,
          referrer,
          metadata,
        },
      ])
      .select("id, created_at")
      .single();

    if (error) return resp(500, { ok: false, error: error.message });

    return resp(200, { ok: true, click: data });
  } catch (e: any) {
    return resp(500, { ok: false, error: e?.message || "Unknown error" });
  }
};
