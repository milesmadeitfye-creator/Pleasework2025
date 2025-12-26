import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Env vars validation
const requiredEnvVars = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PRICE_ARTIST: process.env.STRIPE_PRICE_ARTIST,
  STRIPE_PRICE_GROWTH: process.env.STRIPE_PRICE_GROWTH,
  STRIPE_PRICE_SCALE: process.env.STRIPE_PRICE_SCALE,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  APP_BASE_URL: process.env.APP_BASE_URL || 'https://ghoste.one',
};

const missingEnvVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => !value && key !== 'APP_BASE_URL')
  .map(([key]) => key);

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
    // Check for missing env vars
    if (missingEnvVars.length > 0) {
      console.error('[stripe-checkout] Missing env vars:', missingEnvVars);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Billing not configured',
          details: `Missing environment variables: ${missingEnvVars.join(', ')}`,
          missingEnvVars,
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
      requiredEnvVars.SUPABASE_URL!,
      requiredEnvVars.SUPABASE_ANON_KEY!
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
    const validPlans = ['artist', 'growth', 'scale'];
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

    // Map plan to Stripe price ID
    const priceIdMap: Record<string, string> = {
      artist: requiredEnvVars.STRIPE_PRICE_ARTIST!,
      growth: requiredEnvVars.STRIPE_PRICE_GROWTH!,
      scale: requiredEnvVars.STRIPE_PRICE_SCALE!,
    };

    const priceId = priceIdMap[plan];
    if (!priceId) {
      console.error('[stripe-checkout] Missing price ID for plan:', plan);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Plan not configured',
          details: `No Stripe price ID found for plan: ${plan}`,
        }),
      };
    }

    // Initialize Stripe
    const stripe = new Stripe(requiredEnvVars.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-11-20.acacia',
    });

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          user_id: user.id,
          plan,
          source: 'subscriptions_page',
        },
      },
      success_url: `${requiredEnvVars.APP_BASE_URL}/dashboard/overview?checkout=success`,
      cancel_url: `${requiredEnvVars.APP_BASE_URL}/subscriptions?checkout=cancel`,
      customer_email: user.email || undefined,
      metadata: {
        user_id: user.id,
        plan,
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
