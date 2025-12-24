import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "ok" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: cors,
      body: JSON.stringify({ ok: false, error: "Method not allowed" }),
    };
  }

  try {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      console.error("[link-click-track] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ ok: false, error: "Missing Supabase credentials" }),
      };
    }

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });

    const payload = event.body ? JSON.parse(event.body) : {};
    const {
      owner_user_id,
      link_id,
      link_type = "smart_link",
      platform,
      referrer = null,
      page_url = null,
      user_agent = null,
    } = payload;

    if (!owner_user_id || !platform) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ ok: false, error: "owner_user_id and platform are required" }),
      };
    }

    console.log("[link-click-track] Recording click:", {
      owner_user_id,
      link_id,
      platform,
      link_type,
    });

    const insertRow: any = {
      owner_user_id,
      link_type,
      platform,
      referrer,
      page_url,
      user_agent,
    };

    // Include link_id if provided
    if (link_id) {
      insertRow.link_id = link_id;
    }

    const { error } = await supabase.from("link_click_events").insert([insertRow]);

    if (error) {
      console.error("[link-click-track] Insert error:", error);
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ ok: false, error: error.message }),
      };
    }

    console.log("[link-click-track] Click recorded successfully");
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ ok: true }),
    };
  } catch (e: any) {
    console.error("[link-click-track] Unexpected error:", e);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ ok: false, error: e?.message || String(e) }),
    };
  }
};
