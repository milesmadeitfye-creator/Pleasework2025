import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';

/**
 * List active Stripe prices using lookup keys (lookup IDs)
 * Returns curated list of 3 plans: Artist, Growth, Scale
 *
 * Uses deterministic lookup keys:
 * - artist_monthly
 * - growth_monthly
 * - scale_monthly
 */

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const LOOKUP_KEYS = {
  artist: 'artist_monthly',
  growth: 'growth_monthly',
  scale: 'scale_monthly',
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
          ok: false,
          error: 'Billing not configured',
          details: 'Missing STRIPE_SECRET_KEY environment variable',
        }),
      };
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia',
    });

    console.log('[stripe-prices-list] Fetching prices with lookup keys:', LOOKUP_KEYS);

    // Fetch all active prices with product data
    const allPrices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
      limit: 100,
    });

    console.log('[stripe-prices-list] Found', allPrices.data.length, 'active prices');

    // Filter to our lookup keys and build response
    const prices: Record<string, any> = {};
    const missingKeys: string[] = [];

    for (const [planKey, lookupKey] of Object.entries(LOOKUP_KEYS)) {
      const price = allPrices.data.find((p) => p.lookup_key === lookupKey);

      if (!price) {
        console.warn(`[stripe-prices-list] Missing lookup key: ${lookupKey}`);
        missingKeys.push(lookupKey);
        continue;
      }

      // Validate price structure
      if (price.type !== 'recurring') {
        console.warn(`[stripe-prices-list] Price ${lookupKey} is not recurring, skipping`);
        continue;
      }

      if (!price.unit_amount) {
        console.warn(`[stripe-prices-list] Price ${lookupKey} has no unit_amount, skipping`);
        continue;
      }

      const product = price.product as Stripe.Product;
      if (!product || typeof product === 'string') {
        console.warn(`[stripe-prices-list] Price ${lookupKey} has invalid product, skipping`);
        continue;
      }

      prices[planKey] = {
        lookup_key: lookupKey,
        price_id: price.id,
        product_id: product.id,
        product_name: product.name,
        product_description: product.description || '',
        unit_amount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval || 'month',
        interval_count: price.recurring?.interval_count || 1,
      };

      console.log(`[stripe-prices-list] Loaded ${planKey}:`, {
        lookup_key: lookupKey,
        price_id: price.id,
        amount: price.unit_amount,
      });
    }

    // If any lookup keys are missing, return error
    if (missingKeys.length > 0) {
      console.error('[stripe-prices-list] Missing lookup keys:', missingKeys);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'missing_lookup_keys',
          details: `The following Stripe lookup keys are not configured: ${missingKeys.join(', ')}`,
          missing: missingKeys,
          help: 'Configure these lookup keys in your Stripe Dashboard under Product → Pricing',
        }),
      };
    }

    // Success - return all 3 prices
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        prices,
        count: Object.keys(prices).length,
      }),
    };
  } catch (err: any) {
    console.error('[stripe-prices-list] Error:', err);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Failed to fetch prices',
        details: err.message || String(err),
      }),
    };
  }
};
