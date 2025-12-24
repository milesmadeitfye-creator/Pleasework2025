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
      .select("access_token,ad_account_id")
      .eq("user_id", userId)
      .single();

    if (creds.error || !creds.data?.access_token || !creds.data?.ad_account_id) {
      return { statusCode: 200, headers: RESPONSE_HEADERS, body: JSON.stringify({ ok: false, error: "missing_meta_credentials", details: creds.error }) };
    }

    const token = creds.data.access_token;
    const adAccountId = normalizeAdAccountId(creds.data.ad_account_id);

    const fields = ["id","name","objective","status","effective_status","daily_budget","lifetime_budget"].join(",");
    const campaignResp = await metaGet(
      token,
      `https://graph.facebook.com/${META_VER}/${adAccountId}/campaigns?fields=${encodeURIComponent(fields)}&limit=200`
    );

    const campaigns = campaignResp?.data || [];
    const nowIso = new Date().toISOString();

    const rows: any[] = [];
    for (const c of campaigns) {
      const today = await metaGet(
        token,
        `https://graph.facebook.com/${META_VER}/${c.id}/insights?date_preset=today&fields=spend`
      );
      const spendToday = Number(today?.data?.[0]?.spend || 0);

      const last7 = await metaGet(
        token,
        `https://graph.facebook.com/${META_VER}/${c.id}/insights?date_preset=last_7d&fields=spend,impressions,clicks,cpc,cpm`
      );
      const row7 = last7?.data?.[0] || {};

      rows.push({
        user_id: userId,
        ad_account_id: adAccountId,
        meta_campaign_id: c.id,
        name: c.name || null,
        objective: c.objective || null,
        status: c.status || null,
        effective_status: c.effective_status || null,
        daily_budget_cents: c.daily_budget ? Math.round(Number(c.daily_budget)) : null,
        lifetime_budget_cents: c.lifetime_budget ? Math.round(Number(c.lifetime_budget)) : null,
        spend_today: spendToday,
        spend_7d: row7.spend ? Number(row7.spend) : 0,
        impressions_7d: row7.impressions ? Number(row7.impressions) : null,
        clicks_7d: row7.clicks ? Number(row7.clicks) : null,
        cpc_7d: row7.cpc ? Number(row7.cpc) : null,
        cpm_7d: row7.cpm ? Number(row7.cpm) : null,
        last_synced_at: nowIso,
      });
    }

    if (rows.length) {
      const up = await supabase
        .from("meta_campaigns")
        .upsert(rows, { onConflict: "user_id,ad_account_id,meta_campaign_id" });

      if (up.error) return { statusCode: 200, headers: RESPONSE_HEADERS, body: JSON.stringify({ ok: false, error: "upsert_failed", details: up.error }) };
    }

    return { statusCode: 200, headers: RESPONSE_HEADERS, body: JSON.stringify({ ok: true, saved: rows.length }) };
  } catch (e: any) {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: JSON.stringify({ ok: false, error: "meta_sync_failed", message: e?.message || String(e) }) };
  }
};
