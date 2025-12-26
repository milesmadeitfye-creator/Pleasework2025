import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { loadAppConfig } from './_lib/appSecrets';

// Lookup keys for the 3 plans
const LOOKUP_KEYS: Record<string, string> = {
  artist: 'artist_monthly',
  growth: 'growth_monthly',
  scale: 'scale_monthly',
};

// CORS headers
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  // Handle OPTIONS for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only POST allowed
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
    // Load app configuration from app_secrets
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

    // Check for Stripe secret key
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

    // Extract JWT from Authorization header
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

    // Validate user session with Supabase
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

    // Parse request body
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

    const { plan } = body;

    // Validate plan
    const validPlans = Object.keys(LOOKUP_KEYS);
    if (!plan || !validPlans.includes(plan)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Invalid plan',
          details: `Plan must be one of: ${validPlans.join(', ')}`,
        }),
      };
    }

    // Get lookup key for this plan
    const lookupKey = LOOKUP_KEYS[plan];

    console.log('[stripe-checkout] Creating checkout for:', {
      userId: user.id,
      plan,
      lookupKey,
    });

    // Initialize Stripe
    const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia',
    });

    // Resolve lookup key to price ID
    const prices = await stripe.prices.list({
      active: true,
      lookup_keys: [lookupKey],
      limit: 1,
    });

    if (prices.data.length === 0) {
      console.error('[stripe-checkout] Lookup key not found:', lookupKey);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'lookup_key_not_found',
          details: `Stripe lookup key not found: ${lookupKey}. Configure this in your Stripe Dashboard.`,
          lookup_key: lookupKey,
        }),
      };
    }

    const price = prices.data[0];
    console.log('[stripe-checkout] Resolved price:', {
      priceId: price.id,
      amount: price.unit_amount,
    });

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          user_id: user.id,
          plan,
          lookup_key: lookupKey,
          source: 'subscriptions_page',
        },
      },
      success_url: `${config.APP_BASE_URL}/dashboard/overview?checkout=success`,
      cancel_url: `${config.APP_BASE_URL}/subscriptions?checkout=cancel`,
      customer_email: user.email || undefined,
      metadata: {
        user_id: user.id,
        plan,
        lookup_key: lookupKey,
        source: 'subscriptions_page',
      },
    });

    console.log('[stripe-checkout] Session created:', {
      sessionId: session.id,
      userId: user.id,
      plan,
    });

    // Return checkout URL
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

    // Handle Stripe-specific errors
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

    // Generic error
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
