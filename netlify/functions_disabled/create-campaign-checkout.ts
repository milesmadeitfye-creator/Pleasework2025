import type { Handler } from "@netlify/functions";
import Stripe from "stripe";

const STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY;

const allowedOrigins = [
  "https://ghoste.one",
  "http://localhost:5173",
];

function getOrigin(originHeader?: string) {
  if (!originHeader) return "";
  return allowedOrigins.includes(originHeader) ? originHeader : "";
}

if (!STRIPE_CONNECT_SECRET_KEY) {
  console.warn(
    "STRIPE_CONNECT_SECRET_KEY is not set. create-campaign-checkout will not work until this is configured."
  );
}

const stripe = STRIPE_CONNECT_SECRET_KEY
  ? new Stripe(STRIPE_CONNECT_SECRET_KEY, {
      apiVersion: "2024-06-20" as any,
    })
  : (null as unknown as Stripe);

type RequestBody = {
  userId: string;
  email: string;
  campaignId?: string;
  campaignName: string;
  budget: number;
  redirectBaseUrl?: string;
};

const handler: Handler = async (event) => {
  const corsOrigin = getOrigin(event.headers.origin);

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": corsOrigin || "https://ghoste.one",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": origin || "https://ghoste.one" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    if (!stripe || !STRIPE_CONNECT_SECRET_KEY) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": origin || "https://ghoste.one" },
        body: JSON.stringify({
          error:
            "Stripe is not configured. Ask the admin to set STRIPE_CONNECT_SECRET_KEY.",
        }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": origin || "https://ghoste.one" },
        body: JSON.stringify({ error: "Empty request body." }),
      };
    }

    const body: RequestBody = JSON.parse(event.body);
    const { userId, email, campaignName, budget, redirectBaseUrl } = body;
    let { campaignId } = body;

    if (!userId || !email || !campaignName || !budget) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": origin || "https://ghoste.one" },
        body: JSON.stringify({
          error: "Missing userId, email, campaignName, or budget.",
        }),
      };
    }

    const redirectOrigin = redirectBaseUrl || "https://yourdomain.com";

    if (!campaignId) {
      const slug =
        campaignName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "") || "campaign";
      const rand = Math.random().toString(36).slice(2, 8);
      campaignId = `${slug}-${rand}`;
    }

    const safeBudget = Math.max(Number(budget) || 0, 1);
    const automationFee = 19;
    const total = safeBudget + automationFee;

    const totalAmountCents = Math.round(total * 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Campaign: ${campaignName}`,
              description: `Ad budget $${safeBudget.toFixed(
                2
              )} + $${automationFee.toFixed(2)} automation fee`,
            },
            unit_amount: totalAmountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        campaignId,
        campaignName,
        campaignBudget: safeBudget.toString(),
        automationFee: automationFee.toString(),
      },
      success_url: `${redirectOrigin}/campaigns/${encodeURIComponent(
        campaignId
      )}?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${redirectOrigin}/campaigns/${encodeURIComponent(
        campaignId
      )}?status=cancelled`,
    });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": corsOrigin || "https://ghoste.one",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: session.url,
        campaignId,
      }),
    };
  } catch (err: any) {
    console.error("create-campaign-checkout error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": corsOrigin || "https://ghoste.one" },
      body: JSON.stringify({
        error:
          err?.message ||
          "Unexpected error in create-campaign-checkout function.",
      }),
    };
  }
};

export { handler };
