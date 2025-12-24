import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const json = (statusCode: number, body: any) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  },
  body: JSON.stringify(body),
});

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { success: false, error: "method_not_allowed" });

  try {
    const { slug, debug } = JSON.parse(event.body || "{}");
    if (!slug) return json(400, { success: false, error: "missing_slug" });

    const supabase = supabaseAdmin();

    const { data: link, error: linkErr } = await supabase
      .from("smart_links")
      .select("user_id, slug")
      .eq("slug", slug)
      .maybeSingle();

    if (linkErr || !link?.user_id) {
      return json(404, { success: false, error: "smart_link_not_found" });
    }

    const ownerId = link.user_id;

    // Fetch all Meta-related secrets in parallel
    const { data: secrets, error: secretErr } = await supabase
      .from("app_secrets")
      .select("key, value")
      .eq("user_id", ownerId)
      .in("key", ["META_PIXEL_ID", "META_CAPI_ACCESS_TOKEN", "META_CAPI_ENABLED"]);

    if (secretErr) {
      return json(200, { success: false, error: "secret_lookup_failed", owner_user_id: ownerId, details: secretErr.message });
    }

    const secretsMap = new Map((secrets || []).map(s => [s.key, s.value]));

    const pixelId = secretsMap.get("META_PIXEL_ID") ? String(secretsMap.get("META_PIXEL_ID")).trim() : null;
    const capiToken = secretsMap.get("META_CAPI_ACCESS_TOKEN") ? String(secretsMap.get("META_CAPI_ACCESS_TOKEN")).trim() : null;
    const capiEnabledValue = secretsMap.get("META_CAPI_ENABLED") ? String(secretsMap.get("META_CAPI_ENABLED")).toLowerCase() : "";

    const capiEnabled = capiEnabledValue === "true";
    const hasCapiToken = !!capiToken && capiToken.length > 0;

    if (!pixelId) {
      return json(200, {
        success: false,
        error: "pixel_not_configured",
        owner_user_id: ownerId,
        capi_enabled: capiEnabled,
        has_capi_token: hasCapiToken,
        ...(debug ? { debug: { source: "none" } } : {}),
      });
    }

    return json(200, {
      success: true,
      pixel_id: pixelId,
      owner_user_id: ownerId,
      capi_enabled: capiEnabled,
      has_capi_token: hasCapiToken,
      source: "app_secrets",
      ...(debug ? { debug: { owner_user_id: ownerId } } : {}),
    });
  } catch (e: any) {
    return json(200, { success: false, error: "bad_request", message: e?.message || String(e) });
  }
};
