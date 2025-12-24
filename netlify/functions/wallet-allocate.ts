import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { okJSON } from "./_headers";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: okJSON, body: "" };
  try {
    const sb = getSupabaseAdmin();
    if (event.httpMethod !== "POST") return { statusCode: 405, headers: okJSON, body: JSON.stringify({ error: "Method not allowed" }) };
    const { user_id, ai_delta = 0, ad_delta = 0, reason = "rebalance" } = JSON.parse(event.body || "{}");
    if (!user_id) return { statusCode: 400, headers: okJSON, body: JSON.stringify({ error: "user_id required" }) };

    const { data: sum, error: sumErr } = await sb.from("v_wallet_summary").select("*").eq("user_id", user_id).maybeSingle();
    if (sumErr) throw sumErr;

    const ai = Number(sum?.ai_credits || 0);
    const ad = Number(sum?.ad_budget || 0);
    const total = Number(sum?.total_balance || 0);
    const reserve = Number(sum?.safety_reserve || 100);

    const newAI = ai + Number(ai_delta);
    const newAD = ad + Number(ad_delta);

    if (newAI < 0 || newAD < 0) return { statusCode: 400, headers: okJSON, body: JSON.stringify({ error: "bucket cannot be negative" }) };
    if (newAI + newAD > total - reserve + 1e-6) return { statusCode: 400, headers: okJSON, body: JSON.stringify({ error: "exceeds available funds after reserve" }) };

    const { error: upErr } = await sb.from("wallet_allocations").upsert([
      { user_id, bucket: "AI_CREDITS", amount: newAI },
      { user_id, bucket: "AD_BUDGET", amount: newAD }
    ]);
    if (upErr) throw upErr;

    await sb.from("wallet_ledger").insert({ user_id, action: "rebalance", delta_ai: ai_delta, delta_ad: ad_delta, reason });

    const { data: out, error: outErr } = await sb.from("v_wallet_summary").select("*").eq("user_id", user_id).maybeSingle();
    if (outErr) throw outErr;

    return { statusCode: 200, headers: okJSON, body: JSON.stringify(out) };
  } catch (e: any) {
    console.error("wallet-allocate error:", e);
    return { statusCode: 500, headers: okJSON, body: JSON.stringify({ error: e.message || "Internal error" }) };
  }
};
