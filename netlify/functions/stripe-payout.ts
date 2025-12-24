import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const json = (s: number, b: any) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(b)
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST" });

  try {
    const { user_id, amount_cents, approve } = JSON.parse(event.body || "{}");
    if (!user_id || !amount_cents) return json(400, { error: "Missing fields" });
    if (!approve) return json(400, { error: "Approval required" });

    const { data: sc } = await supa
      .from("stripe_connect")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!sc?.account_id || !sc.payouts_enabled) {
      return json(400, { error: "Stripe account not ready" });
    }

    const { data: w } = await supa
      .from("wallets")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    const bal = w?.balance_cents || 0;
    if (amount_cents > bal) return json(400, { error: "Insufficient wallet balance" });

    await supa
      .from("wallets")
      .update({ balance_cents: bal - amount_cents })
      .eq("user_id", user_id);

    await supa.from("wallet_transactions").insert({
      user_id,
      kind: "payout",
      amount_cents: -amount_cents,
      external_ref: `manual:${Date.now()}`
    });

    return json(200, { ok: true, new_balance_cents: bal - amount_cents });
  } catch (e: any) {
    return json(500, { ok: false, error: e.message || "Payout error" });
  }
};
