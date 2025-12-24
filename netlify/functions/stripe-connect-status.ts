import type { Handler } from "@netlify/functions";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" as any });
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const json = (s: number, b: any) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(b)
});

export const handler: Handler = async (event) => {
  try {
    const user_id = event.queryStringParameters?.user_id;
    if (!user_id) return json(400, { error: "Missing user_id" });

    const { data: row } = await supa
      .from("stripe_connect")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!row) return json(200, { ok: true, connected: false });

    const acct = await stripe.accounts.retrieve(row.account_id);
    await supa.from("stripe_connect").upsert({
      user_id,
      account_id: row.account_id,
      details_submitted: !!acct.details_submitted,
      payouts_enabled: !!acct.payouts_enabled
    });

    return json(200, {
      ok: true,
      connected: !!(acct.details_submitted && acct.payouts_enabled),
      details_submitted: !!acct.details_submitted,
      payouts_enabled: !!acct.payouts_enabled
    });
  } catch (e: any) {
    return json(500, { ok: false, error: e.message || "Stripe error" });
  }
};
