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
    const { user_id, return_url } = JSON.parse(event.body || "{}");
    if (!user_id) return json(400, { error: "Missing user_id" });

    let account_id: string;
    const { data: row } = await supa
      .from("stripe_connect")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!row) {
      const acct = await stripe.accounts.create({ type: "express" });
      account_id = acct.id;
      await supa.from("stripe_connect").upsert({ user_id, account_id });
    } else {
      account_id = row.account_id;
    }

    const link = await stripe.accountLinks.create({
      account: account_id,
      refresh_url: return_url || process.env.VITE_SITE_URL!,
      return_url: return_url || process.env.VITE_SITE_URL!,
      type: "account_onboarding"
    });

    return json(200, { ok: true, url: link.url, account_id });
  } catch (e: any) {
    return json(500, { ok: false, error: e.message || "Stripe error" });
  }
};
