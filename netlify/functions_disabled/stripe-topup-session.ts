import type { Handler } from "@netlify/functions";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" as any });

const json = (s: number, b: any) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(b)
});

export const handler: Handler = async (event) => {
  try {
    const { user_id, price_key } = JSON.parse(event.body || "{}");
    if (!user_id || !price_key) return json(400, { error: "Missing user_id or price_key" });

    const success_url = `${process.env.VITE_SITE_URL}/wallet?topup=success`;
    const cancel_url = `${process.env.VITE_SITE_URL}/wallet?topup=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: price_key, quantity: 1 }],
      success_url,
      cancel_url,
      metadata: { user_id }
    });

    return json(200, { ok: true, url: session.url });
  } catch (e: any) {
    return json(500, { ok: false, error: e.message || "Stripe error" });
  }
};
