import type { Handler } from "@netlify/functions";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

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
      console.error("[stripe-finalize] Missing STRIPE_SECRET_KEY");
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "missing_stripe_config",
          message: "Stripe not configured"
        })
      };
    }

    const body = JSON.parse(event.body || "{}");
    const sessionId = body?.session_id;

    if (!sessionId) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Missing session_id" })
      };
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`[stripe-finalize] Retrieving session: ${sessionId}`);

    // Retrieve the checkout session with expanded data
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"]
    });

    if (!session) {
      return {
        statusCode: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Session not found" })
      };
    }

    const plan = session.metadata?.plan || "operator"; // Default to operator ($59/mo)
    const userId = session.metadata?.user_id || session.client_reference_id;
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    const customerEmail = typeof session.customer === "string"
      ? (await stripe.customers.retrieve(session.customer)).email
      : session.customer?.email;

    const subscription = typeof session.subscription === "string"
      ? await stripe.subscriptions.retrieve(session.subscription)
      : session.subscription;

    console.log(`[stripe-finalize] Plan: ${plan}, User: ${userId || "none"}, Customer: ${customerId}`);

    // Check if user is logged in via auth header
    let authenticatedUserId: string | null = null;
    const authHeader = event.headers.authorization || event.headers.Authorization;

    if (authHeader) {
      try {
        const jwt = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(jwt);
        if (user) {
          authenticatedUserId = user.id;
          console.log(`[stripe-finalize] Authenticated user: ${authenticatedUserId}`);
        }
      } catch (err) {
        console.log("[stripe-finalize] No valid auth token");
      }
    }

    const finalUserId = authenticatedUserId || userId;

    if (!finalUserId) {
      // User not logged in - store pending subscription
      console.log(`[stripe-finalize] No user ID, creating pending subscription for email: ${customerEmail}`);

      if (customerEmail) {
        // Store in pending_subscriptions or user_profiles for later linking
        await supabase.from("pending_subscriptions").upsert({
          email: customerEmail,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription?.id,
          plan,
          status: subscription?.status || "active",
          session_id: sessionId,
          created_at: new Date().toISOString()
        }, {
          onConflict: "email"
        });
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true,
          needs_signup: true,
          email: customerEmail,
          message: "Please sign up to complete your subscription"
        })
      };
    }

    // User is logged in - attach subscription to their profile
    console.log(`[stripe-finalize] Updating user ${finalUserId} with subscription`);

    // Update user_profiles with subscription data
    const { error: profileError } = await supabase
      .from("user_profiles")
      .upsert({
        id: finalUserId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription?.id,
        plan,
        subscription_status: subscription?.status || "active",
        trial_end: subscription?.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        current_period_end: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "id",
        ignoreDuplicates: false
      });

    if (profileError) {
      console.error("[stripe-finalize] Error updating profile:", profileError);
      // Don't fail - subscription is still created in Stripe
    }

    // Also create/update in subscriptions table if it exists
    try {
      await supabase.from("subscriptions").upsert({
        user_id: finalUserId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription?.id,
        plan,
        status: subscription?.status || "active",
        trial_end: subscription?.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        current_period_end: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: "user_id"
      });
    } catch (err) {
      // Table might not exist, that's ok
      console.log("[stripe-finalize] Subscriptions table not found (ok)");
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        redirect: "/dashboard/overview",
        plan,
        trial_end: subscription?.trial_end
      })
    };

  } catch (err: any) {
    console.error("[stripe-finalize] Error:", err?.message || err);
    console.error("[stripe-finalize] Stack:", err?.stack);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "finalize_error",
        message: err?.message || "Failed to finalize checkout"
      })
    };
  }
};
