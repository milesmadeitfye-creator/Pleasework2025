import type { Handler } from "@netlify/functions";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getPriceIdForPlan, type PlanKey } from "./_lib/stripePricing";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Method not allowed" })
      };
    }

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      console.error("[stripe-create-checkout] Missing STRIPE_SECRET_KEY");
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "missing_stripe_config",
          message: "STRIPE_SECRET_KEY environment variable is not configured",
          missing: ["STRIPE_SECRET_KEY"]
        })
      };
    }

    const body = JSON.parse(event.body || "{}");
    const plan = (body?.plan || "operator") as PlanKey; // Default to operator ($59/mo)

    // Validate plan
    if (!['operator', 'growth', 'label'].includes(plan)) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Invalid plan. Must be operator, growth, or label."
        })
      };
    }

    // Resolve price ID using smart resolver (checks env vars + Stripe API)
    let priceId: string;
    try {
      priceId = await getPriceIdForPlan(plan, stripeSecret);
      console.log(`[stripe-create-checkout] Resolved ${plan} price: ${priceId}`);
    } catch (error: any) {
      console.error(`[stripe-create-checkout] Failed to resolve price for ${plan}:`, error.message);
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "price_not_found",
          message: error.message,
          plan
        })
      };
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

    console.log(`[stripe-create-checkout] Creating checkout for plan: ${plan}`);

    // Determine origin from request
    const protocol = event.headers["x-forwarded-proto"] || "https";
    const host = event.headers["x-forwarded-host"] || event.headers.host || "ghoste.one";
    const origin = `${protocol}://${host}`;

    // Use env var URLs or construct from origin
    const successUrl = process.env.STRIPE_SUCCESS_URL || `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = process.env.STRIPE_CANCEL_URL || `${origin}/pricing`;

    console.log(`[stripe-create-checkout] Origin: ${origin}, Success URL: ${successUrl}`);

    // Check if user is authenticated
    let userId: string | null = null;
    let userEmail: string | null = null;

    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (authHeader && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const jwt = authHeader.replace("Bearer ", "");
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: { user } } = await supabase.auth.getUser(jwt);
        if (user) {
          userId = user.id;
          userEmail = user.email || null;
          console.log(`[stripe-create-checkout] Authenticated user: ${userId}`);
        }
      } catch (err) {
        console.log('[stripe-create-checkout] No valid auth token');
      }
    }

    // Create Stripe checkout session
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: "auto",
      subscription_data: {
        metadata: {
          plan,
          app: "ghoste_one"
        },
        trial_period_days: 7, // 7-day trial for all plans
      },
      metadata: {
        plan,
        app: "ghoste_one",
        ...(userId ? { user_id: userId } : { needs_account: "1" }),
      },
    };

    // If user is logged in, attach their info
    if (userId) {
      sessionConfig.client_reference_id = userId;
    }

    if (userEmail) {
      sessionConfig.customer_email = userEmail;
    } else if (body?.email) {
      sessionConfig.customer_email = body.email;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log(`[stripe-create-checkout] Session created: ${session.id}`);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, url: session.url, session_id: session.id }),
    };
  } catch (err: any) {
    console.error("[stripe-create-checkout] Error:", err?.message || err);
    console.error("[stripe-create-checkout] Stack:", err?.stack);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "stripe_error",
        message: err?.message || "Checkout failed"
      }),
    };
  }
};
