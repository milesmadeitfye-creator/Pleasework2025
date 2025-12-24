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
    "STRIPE_CONNECT_SECRET_KEY is not set. Stripe Connect will not work until this is configured."
  );
}

const stripe = STRIPE_CONNECT_SECRET_KEY
  ? new Stripe(STRIPE_CONNECT_SECRET_KEY, {
      apiVersion: "2024-06-20" as any,
    })
  : (null as unknown as Stripe);

type Action = "status" | "onboard" | "manage";

type RequestBody = {
  action: Action;
  userId: string;
  email: string;
  name?: string;
  redirectBaseUrl?: string;
};

async function findAccountByEmail(email: string) {
  if (!stripe) return null;

  let startingAfter: string | undefined = undefined;

  while (true) {
    const accounts = await stripe.accounts.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    const match = accounts.data.find((acct) => acct.email === email);
    if (match) return match;

    if (!accounts.has_more) break;

    startingAfter = accounts.data[accounts.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return null;
}

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
            "Stripe is not configured. Ask the admin to set STRIPE_CONNECT_SECRET_KEY in environment variables.",
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
    const { action, userId, email, name, redirectBaseUrl } = body;

    if (!action || !userId || !email) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": origin || "https://ghoste.one" },
        body: JSON.stringify({
          error: "Missing action, userId, or email.",
        }),
      };
    }

    const safeName = name?.trim() || email;

    if (action === "status") {
      const account = await findAccountByEmail(email);

      if (!account) {
        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": corsOrigin || "https://ghoste.one",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            connected: false,
          }),
        };
      }

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin || "https://ghoste.one",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connected: true,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          accountId: account.id,
        }),
      };
    }

    const redirectOrigin = redirectBaseUrl || "https://yourdomain.com";
    const returnUrl = `${redirectOrigin}/wallet/stripe/connected`;
    const refreshUrl = `${redirectOrigin}/wallet/stripe/refresh`;

    if (action === "onboard") {
      let account = await findAccountByEmail(email);

      if (!account) {
        account = await stripe.accounts.create({
          type: "express",
          email,
          business_type: "individual",
          metadata: {
            platformUserId: userId,
          },
          capabilities: {
            transfers: { requested: true },
          },
        });
      }

      const link = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin || "https://ghoste.one",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: link.url,
        }),
      };
    }

    if (action === "manage") {
      const account = await findAccountByEmail(email);

      if (!account) {
        return {
          statusCode: 400,
          headers: { "Access-Control-Allow-Origin": origin || "https://ghoste.one" },
          body: JSON.stringify({
            error:
              "No Stripe account found for this email. Connect first before managing.",
          }),
        };
      }

      const loginLink = await stripe.accounts.createLoginLink(account.id, {
        redirect_url: `${redirectOrigin}/wallet`,
      } as any);

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin || "https://ghoste.one",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: loginLink.url,
        }),
      };
    }

    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": origin || "https://ghoste.one" },
      body: JSON.stringify({
        error: "Invalid action. Use 'status', 'onboard', or 'manage'.",
      }),
    };
  } catch (err: any) {
    console.error("stripe-connect-account error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": origin || "https://ghoste.one" },
      body: JSON.stringify({
        error:
          err?.message ||
          "Unexpected error in stripe-connect-account function.",
      }),
    };
  }
};

export { handler };
