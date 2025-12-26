import type { Handler } from '@netlify/functions';

/**
 * List Stripe subscription plans
 * Returns hardcoded plan data (NO lookup keys, NO Stripe API calls needed)
 *
 * Price IDs:
 * - Artist: price_1SieEYCmFCKCWOjb4AwhF9b4 ($9/mo)
 * - Growth: price_1SieFYCmFCKCWOjbI2wXKbR7 ($19/mo)
 * - Scale: price_1SieFzCmFCKCWOjbPDYABycm ($49/mo)
 */

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const PLANS = {
  artist: {
    key: 'artist',
    name: 'Artist',
    price_id: 'price_1SieEYCmFCKCWOjb4AwhF9b4',
    unit_amount: 900,
    currency: 'usd',
    interval: 'month',
    interval_count: 1,
  },
  growth: {
    key: 'growth',
    name: 'Growth',
    price_id: 'price_1SieFYCmFCKCWOjbI2wXKbR7',
    unit_amount: 1900,
    currency: 'usd',
    interval: 'month',
    interval_count: 1,
  },
  scale: {
    key: 'scale',
    name: 'Scale',
    price_id: 'price_1SieFzCmFCKCWOjbPDYABycm',
    unit_amount: 4900,
    currency: 'usd',
    interval: 'month',
    interval_count: 1,
  },
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

  console.log('[stripe-prices-list] Returning hardcoded plans');

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      prices: PLANS,
      count: Object.keys(PLANS).length,
    }),
  };
};
