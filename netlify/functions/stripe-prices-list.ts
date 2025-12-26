import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';

/**
 * List active Stripe prices for subscription plans
 * Returns curated list of 3 plans: Artist, Growth, Scale
 *
 * This function dynamically fetches prices from Stripe so UI stays in sync
 * with actual Stripe configuration without hardcoding.
 */

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

    if (!STRIPE_SECRET_KEY) {
      console.error('[stripe-prices-list] Missing STRIPE_SECRET_KEY');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Billing not configured',
          details: 'Missing Stripe credentials',
        }),
      };
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia',
    });

    // Fetch active prices with product data
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
      limit: 100,
    });

    // Filter to subscription prices only and structure data
    const subscriptionPrices = prices.data
      .filter((price) => {
        if (price.type !== 'recurring') return false;
        if (!price.unit_amount) return false;
        if (price.currency !== 'usd') return false;

        const product = price.product as Stripe.Product;
        if (!product || typeof product === 'string') return false;
        if (!product.active) return false;

        // Filter by metadata to identify our subscription plans
        // This allows flexibility - we can tag products in Stripe dashboard
        const metadata = product.metadata || {};
        return metadata.type === 'subscription' || metadata.plan_type === 'subscription';
      })
      .map((price) => {
        const product = price.product as Stripe.Product;

        return {
          price_id: price.id,
          product_id: product.id,
          product_name: product.name,
          product_description: product.description || '',
          unit_amount: price.unit_amount!,
          currency: price.currency,
          interval: price.recurring?.interval || 'month',
          interval_count: price.recurring?.interval_count || 1,
          metadata: product.metadata,
        };
      })
      .sort((a, b) => a.unit_amount - b.unit_amount); // Sort by price ascending

    // Get the configured price IDs from env for reference
    const configuredPrices = {
      artist: process.env.STRIPE_PRICE_ARTIST,
      growth: process.env.STRIPE_PRICE_GROWTH,
      scale: process.env.STRIPE_PRICE_SCALE,
    };

    // Filter to only our 3 main plans using env var matching
    const mainPlans = subscriptionPrices.filter((price) =>
      Object.values(configuredPrices).includes(price.price_id)
    );

    // If no configured prices found, return all subscription prices (fallback)
    const plansToReturn = mainPlans.length > 0 ? mainPlans : subscriptionPrices.slice(0, 3);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        plans: plansToReturn,
        count: plansToReturn.length,
      }),
    };
  } catch (err: any) {
    console.error('[stripe-prices-list] Error:', err);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to fetch prices',
        details: err.message || String(err),
      }),
    };
  }
};
