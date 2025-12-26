import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { loadAppConfig } from './_lib/appSecrets';

/**
 * Stripe Checkout Session Creator
 * Accepts price_id (NOT lookup keys)
 *
 * Allowed Price IDs:
 * - price_1SieEYCmFCKCWOjb4AwhF9b4 (Artist $9)
 * - price_1SieFYCmFCKCWOjbI2wXKbR7 (Growth $19)
 * - price_1SieFzCmFCKCWOjbPDYABycm (Scale $49)
 */

const ALLOWED_PRICE_IDS = new Set([
  'price_1SieEYCmFCKCWOjb4AwhF9b4',
  'price_1SieFYCmFCKCWOjbI2wXKbR7',
  'price_1SieFzCmFCKCWOjbPDYABycm',
]);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Method not allowed',
        details: 'Use POST',
      }),
    };
  }

  try {
    let config;
    try {
      config = await loadAppConfig();
    } catch (configErr: any) {
      console.error('[stripe-checkout] Config load error:', configErr);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Configuration error',
          details: configErr.message || 'Failed to load app configuration',
        }),
      };
    }

    if (!config.STRIPE_SECRET_KEY) {
      console.error('[stripe-checkout] Missing STRIPE_SECRET_KEY');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Billing not configured',
          details: 'STRIPE_SECRET_KEY not found in app_secrets or environment variables',
        }),
      };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Unauthorized',
          details: 'Missing or invalid Authorization header',
        }),
      };
    }

    const jwt = authHeader.replace('Bearer ', '');

    const supabase = createClient(
      config.SUPABASE_URL,
      config.SUPABASE_ANON_KEY
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      console.error('[stripe-checkout] Auth error:', authError);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Unauthorized',
          details: authError?.message || 'Invalid session',
        }),
      };
    }

    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (err) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Invalid JSON',
          details: 'Request body must be valid JSON',
        }),
      };
    }

    const { price_id } = body;

    if (!price_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Missing price_id',
          details: 'price_id is required in request body',
        }),
      };
    }

    if (!ALLOWED_PRICE_IDS.has(price_id)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Invalid price_id',
          details: `price_id must be one of: ${Array.from(ALLOWED_PRICE_IDS).join(', ')}`,
          provided: price_id,
        }),
      };
    }

    console.log('[stripe-checkout] Creating checkout for:', {
      userId: user.id,
      priceId: price_id,
    });

    const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia',
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: price_id,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          user_id: user.id,
          price_id,
        },
      },
      success_url: `${config.APP_BASE_URL}/subscriptions?checkout=success`,
      cancel_url: `${config.APP_BASE_URL}/subscriptions?checkout=canceled`,
      customer_email: user.email || undefined,
      metadata: {
        user_id: user.id,
        price_id,
      },
    });

    console.log('[stripe-checkout] Session created:', {
      sessionId: session.id,
      userId: user.id,
      priceId: price_id,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        url: session.url,
      }),
    };
  } catch (err: any) {
    console.error('[stripe-checkout] Error:', err);

    if (err.type === 'StripeInvalidRequestError') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Invalid checkout request',
          details: err.message,
        }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Failed to create checkout session',
        details: err.message || String(err),
      }),
    };
  }
};
