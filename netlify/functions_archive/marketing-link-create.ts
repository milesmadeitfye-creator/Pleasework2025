import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ok = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function isValidSlug(s?: string) {
  return !s || /^[a-z0-9-]{3,64}$/.test(s);
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: ok, body: "" };
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: ok, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const body = JSON.parse(event.body || "{}");
    if (!body?.type || !body?.title || !body?.settings) {
      return { statusCode: 400, headers: ok, body: JSON.stringify({ error: "Missing required fields" }) };
    }
    if (!isValidSlug(body.slug)) {
      return { statusCode: 400, headers: ok, body: JSON.stringify({ error: "Invalid slug" }) };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    let owner_id: string | null = null;
    if (token) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const { data: u } = await admin.auth.getUser(token);
      owner_id = u?.user?.id ?? null;
    }
    if (!owner_id) {
      return { statusCode: 401, headers: ok, body: JSON.stringify({ error: "Auth required to create link" }) };
    }

    const insert = {
      owner_id,
      type: body.type,
      title: body.title,
      slug: body.slug || null,
      settings: body.settings,
      pixel_enabled: body.pixel_enabled ?? true,
      capi_enabled: body.capi_enabled ?? true,
    };

    const { data, error } = await supabase
      .from("marketing_links")
      .insert(insert)
      .select("id, slug, type, settings, pixel_enabled, capi_enabled")
      .single();

    if (error) throw error;

    const host = (event.headers["x-forwarded-host"] || event.headers.host) as string;
    const proto = (event.headers["x-forwarded-proto"] || "https") as string;
    const adminUrl = `${proto}://${host}/dashboard/links/${data.id}`;
    const publicUrl = `${proto}://${host}/x/${data.slug || data.id}`;

    return { statusCode: 200, headers: ok, body: JSON.stringify({ link: data, adminUrl, publicUrl }) };
  } catch (e: any) {
    return { statusCode: 500, headers: ok, body: JSON.stringify({ error: e.message || "Internal error" }) };
  }
};
