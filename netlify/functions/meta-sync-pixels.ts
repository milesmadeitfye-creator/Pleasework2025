import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { RESPONSE_HEADERS } from "./_shared/headers";

const META_VER = process.env.META_API_VERSION || "v24.0";
const sb = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function normalizeAdAccountId(raw?: string | null): string {
  if (!raw) return "";
  let s = String(raw).trim();
  if (s.startsWith("act_act_")) s = s.replace(/^act_act_/, "act_");
  // if digits only, prefix with act_
  if (!s.startsWith("act_") && /^\d+$/.test(s)) s = `act_${s}`;
  return s;
}

async function metaGet(token: string, url: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Meta GET failed ${r.status}`);
  return j;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: "" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: RESPONSE_HEADERS, body: JSON.stringify({ error: "method_not_allowed" }) };
    }
    const { userId } = JSON.parse(event.body || "{}");
    if (!userId) {
      return { statusCode: 200, headers: RESPONSE_HEADERS, body: JSON.stringify({ ok: false, error: "missing_userId" }) };
    }

    const supabase = sb();

    const creds = await supabase
      .from("meta_credentials")
      .select("access_token,ad_account_id,business_id")
      .eq("user_id", userId)
      .single();

    if (creds.error || !creds.data?.access_token) {
      return { statusCode: 200, headers: RESPONSE_HEADERS, body: JSON.stringify({ ok: false, error: "missing_meta_credentials", details: creds.error }) };
    }

    const token = creds.data.access_token;
    const adAccountId = normalizeAdAccountId(creds.data.ad_account_id);
    const businessId = creds.data.business_id;

    const nowIso = new Date().toISOString();
    const pixels: any[] = [];

    if (adAccountId) {
      const a = await metaGet(
        token,
        `https://graph.facebook.com/${META_VER}/${adAccountId}/adspixels?fields=id,name&limit=200`
      );
      for (const p of (a?.data || [])) {
        pixels.push({
          user_id: userId,
          ad_account_id: adAccountId,
          meta_pixel_id: p.id,
          name: p.name || null,
          owner_business_id: businessId || null,
          is_available: true,
          last_synced_at: nowIso,
        });
      }
    }

    if (businessId) {
      const b = await metaGet(
        token,
        `https://graph.facebook.com/${META_VER}/${businessId}/owned_pixels?fields=id,name&limit=200`
      );
      for (const p of (b?.data || [])) {
        pixels.push({
          user_id: userId,
          ad_account_id: adAccountId || null,
          meta_pixel_id: p.id,
          name: p.name || null,
          owner_business_id: businessId,
          is_available: true,
          last_synced_at: nowIso,
        });
      }
    }

    if (pixels.length) {
      const up = await supabase.from("meta_pixels").upsert(pixels, { onConflict: "user_id,meta_pixel_id" });
      if (up.error) return { statusCode: 200, headers: RESPONSE_HEADERS, body: JSON.stringify({ ok: false, error: "pixel_upsert_failed", details: up.error }) };
    }

    return { statusCode: 200, headers: RESPONSE_HEADERS, body: JSON.stringify({ ok: true, saved: pixels.length }) };
  } catch (e: any) {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: JSON.stringify({ ok: false, error: "pixel_sync_failed", message: e?.message || String(e) }) };
  }
};
