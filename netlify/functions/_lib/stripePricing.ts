/**
 * Smart Stripe Price Resolver
 *
 * Automatically discovers price IDs from Stripe products.
 * Falls back to env vars if available.
 * Caches results in memory to avoid repeated API calls.
 */

import Stripe from "stripe";

// Plan configuration with expected pricing
export const PLAN_CONFIG = {
  operator: {
    name: "Operator",
    price: 59,
    envVars: ["STRIPE_OPERATOR_PRICE_ID", "STRIPE_PRICE_OPERATOR_MONTHLY"],
    matchNames: ["ghoste operator", "operator", "operator plan"],
    metadataKey: "operator",
  },
  growth: {
    name: "Growth",
    price: 29,
    envVars: ["STRIPE_GROWTH_PRICE_ID", "STRIPE_PRICE_GROWTH_MONTHLY", "STRIPE_PRICE_ID_59"],
    matchNames: ["ghoste growth", "growth", "growth plan"],
    metadataKey: "growth",
  },
  label: {
    name: "Label",
    price: 99,
    envVars: ["STRIPE_LABEL_PRICE_ID", "STRIPE_PRICE_LABEL_MONTHLY"],
    matchNames: ["ghoste label", "label", "label plan"],
    metadataKey: "label",
  },
} as const;

export type PlanKey = keyof typeof PLAN_CONFIG;

// In-memory cache for resolved price IDs (lives for function duration)
const priceCache = new Map<PlanKey, string>();
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get price ID for a plan - tries env vars first, then Stripe API
 */
export async function getPriceIdForPlan(
  planKey: PlanKey,
  stripeSecret: string
): Promise<string> {
  const config = PLAN_CONFIG[planKey];

  // Step 1: Check env vars
  for (const envVar of config.envVars) {
    const value = process.env[envVar];
    if (value && value.startsWith("price_")) {
      console.log(`[stripePricing] Found ${planKey} price via ${envVar}: ${value}`);
      return value;
    }
  }

  // Step 2: Check cache (if still valid)
  const now = Date.now();
  if (priceCache.has(planKey) && now - cacheTimestamp < CACHE_TTL) {
    const cached = priceCache.get(planKey)!;
    console.log(`[stripePricing] Using cached price for ${planKey}: ${cached}`);
    return cached;
  }

  // Step 3: Query Stripe API
  console.log(`[stripePricing] Resolving ${planKey} price from Stripe API...`);

  try {
    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

    // Fetch all active recurring prices
    const prices = await stripe.prices.list({
      active: true,
      type: "recurring",
      limit: 100,
      expand: ["data.product"],
    });

    console.log(`[stripePricing] Found ${prices.data.length} active recurring prices`);

    // Find matching price
    for (const price of prices.data) {
      if (!price.product || typeof price.product === "string") continue;

      const product = price.product as Stripe.Product;
      const productName = (product.name || "").toLowerCase();
      const priceAmount = price.unit_amount ? price.unit_amount / 100 : 0;

      // Match by metadata first (most reliable)
      if (product.metadata?.plan_key === config.metadataKey) {
        console.log(`[stripePricing] Matched ${planKey} by metadata: ${price.id} (${product.name})`);
        priceCache.set(planKey, price.id);
        cacheTimestamp = now;
        return price.id;
      }

      // Match by price.metadata
      if (price.metadata?.plan_key === config.metadataKey) {
        console.log(`[stripePricing] Matched ${planKey} by price metadata: ${price.id} (${product.name})`);
        priceCache.set(planKey, price.id);
        cacheTimestamp = now;
        return price.id;
      }

      // Match by product name
      const nameMatches = config.matchNames.some(name => productName.includes(name));
      if (nameMatches) {
        console.log(`[stripePricing] Matched ${planKey} by name: ${price.id} (${product.name}, $${priceAmount})`);
        priceCache.set(planKey, price.id);
        cacheTimestamp = now;
        return price.id;
      }

      // Match by price amount (fallback)
      if (priceAmount === config.price && price.recurring?.interval === "month") {
        console.log(`[stripePricing] Matched ${planKey} by price: ${price.id} (${product.name}, $${priceAmount}/mo)`);
        priceCache.set(planKey, price.id);
        cacheTimestamp = now;
        return price.id;
      }
    }

    // No match found
    throw new Error(
      `No Stripe price found for ${planKey} plan. ` +
      `Expected: $${config.price}/month. ` +
      `Searched ${prices.data.length} prices. ` +
      `To fix: Add env var ${config.envVars[0]} or set product.metadata.plan_key="${config.metadataKey}" in Stripe.`
    );
  } catch (error: any) {
    if (error.message.includes("No Stripe price found")) {
      throw error;
    }

    console.error(`[stripePricing] Error querying Stripe:`, error);
    throw new Error(
      `Failed to resolve ${planKey} price: ${error.message}. ` +
      `Please set ${config.envVars[0]} environment variable.`
    );
  }
}

/**
 * Get all available plan prices (for admin/debugging)
 */
export async function getAllPlanPrices(stripeSecret: string): Promise<Record<PlanKey, string | null>> {
  const results: Record<string, string | null> = {};

  for (const planKey of Object.keys(PLAN_CONFIG) as PlanKey[]) {
    try {
      results[planKey] = await getPriceIdForPlan(planKey, stripeSecret);
    } catch (error: any) {
      console.warn(`[stripePricing] Could not resolve ${planKey}:`, error.message);
      results[planKey] = null;
    }
  }

  return results as Record<PlanKey, string | null>;
}

/**
 * Clear the price cache (useful for testing)
 */
export function clearPriceCache(): void {
  priceCache.clear();
  cacheTimestamp = 0;
  console.log("[stripePricing] Cache cleared");
}
