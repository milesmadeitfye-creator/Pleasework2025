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

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: ok, body: "" };
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, headers: ok, body: JSON.stringify({ error: "Method not allowed" }) };

    const body = JSON.parse(event.body || "{}");
    if (body.type !== "pre_save") {
      return { statusCode: 400, headers: ok, body: JSON.stringify({ error: "type must be pre_save" }) };
    }
    const settings = body.settings as any;
    if (!settings?.upc_or_isrc || !Array.isArray(settings?.platforms) || settings.platforms.length === 0) {
      return { statusCode: 400, headers: ok, body: JSON.stringify({ error: "upc_or_isrc and platforms required" }) };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: u } = await admin.auth.getUser(token || "");
    const owner_id = u?.user?.id;
    if (!owner_id) return { statusCode: 401, headers: ok, body: JSON.stringify({ error: "Auth required" }) };

    const { data, error } = await supabase
      .from("marketing_links")
      .insert({
        owner_id,
        type: "pre_save",
        title: body.title,
        slug: body.slug || null,
        settings: {
          upc_or_isrc: settings.upc_or_isrc,
          platforms: settings.platforms,
          cover_art_url: settings.cover_art_url || null,
          forever_save: !!settings.forever_save,
          template_name: settings.template_name || "Default"
        },
        pixel_enabled: body.pixel_enabled ?? true,
        capi_enabled: body.capi_enabled ?? true
      })
      .select("id, slug, settings")
      .single();

    if (error) throw error;

    const host = (event.headers["x-forwarded-host"] || event.headers.host) as string;
    const proto = (event.headers["x-forwarded-proto"] || "https") as string;

    return { statusCode: 200, headers: ok, body: JSON.stringify({
      link_id: data.id,
      publicUrl: `${proto}://${host}/x/${data.slug || data.id}`
    })};
  } catch (e:any) {
    return { statusCode: 500, headers: ok, body: JSON.stringify({ error: e.message || "Internal error" }) };
  }
};
