/**
 * Debug endpoint to verify Stripe price configuration
 * Returns all resolved price IDs for all plans
 *
 * Usage: GET /.netlify/functions/stripe-debug-prices
 */

import type { Handler } from "@netlify/functions";
import { getAllPlanPrices, PLAN_CONFIG } from "./_lib/stripePricing";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "STRIPE_SECRET_KEY not configured"
        })
      };
    }

    // Check env vars
    const envVars: Record<string, string | undefined> = {};
    for (const planKey of Object.keys(PLAN_CONFIG)) {
      const config = PLAN_CONFIG[planKey as keyof typeof PLAN_CONFIG];
      for (const envVar of config.envVars) {
        envVars[envVar] = process.env[envVar] || undefined;
      }
    }

    // Resolve all prices
    console.log("[stripe-debug-prices] Resolving prices...");
    const resolvedPrices = await getAllPlanPrices(stripeSecret);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        env_vars: envVars,
        resolved_prices: resolvedPrices,
        config: PLAN_CONFIG,
      }, null, 2)
    };
  } catch (error: any) {
    console.error("[stripe-debug-prices] Error:", error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: error.message
      })
    };
  }
};
