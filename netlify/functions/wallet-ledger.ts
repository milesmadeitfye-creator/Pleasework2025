import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { jsonHeaders, getQueryParam } from "./_sb";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: jsonHeaders, body: "" };
  try {
    const sb = getSupabaseAdmin();
    const user_id = getQueryParam(event, "user_id");
    if (!user_id) return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: "user_id required" }) };

    const { data, error } = await sb.from("wallet_ledger").select("*").eq("user_id", user_id).order("created_at", { ascending: false }).limit(200);
    if (error) throw error;

    return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ items: data || [] }) };
  } catch (e: any) {
    console.error("wallet-ledger error:", e);
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: e.message || "Internal error" }) };
  }
};
