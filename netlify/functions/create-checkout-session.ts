import { Handler, HandlerEvent } from '@netlify/functions';
import Stripe from 'stripe';

type PlanId = 'operator' | 'growth' | 'label';

const PLAN_ENV_MAP: Record<PlanId, string> = {
  operator: 'STRIPE_PRICE_OPERATOR_MONTHLY',
  growth: 'STRIPE_PRICE_GROWTH_MONTHLY',
  label: 'STRIPE_PRICE_LABEL_MONTHLY',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      console.error('[CHECKOUT] STRIPE_SECRET_KEY not configured');
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const userId = body.userId;
    const planId: PlanId = body.planId || 'growth'; // Default to growth plan

    if (!userId) {
      console.error('[CHECKOUT] Request received without userId');
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'userId is required' }),
      };
    }

    // Validate planId
    if (!PLAN_ENV_MAP[planId]) {
      console.error('[CHECKOUT] Invalid planId:', planId);
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid planId' }),
      };
    }

    // Get price ID from environment
    const priceEnvKey = PLAN_ENV_MAP[planId];
    const stripePriceId = process.env[priceEnvKey];

    if (!stripePriceId) {
      console.error(`[CHECKOUT] ${priceEnvKey} not configured`);
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `${priceEnvKey} not configured` }),
      };
    }

    console.log('[CHECKOUT] Creating session for userId:', userId, 'planId:', planId);

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-10-29.clover',
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: 'https://ghoste.one/checkout/stripe?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://ghoste.one/pricing?canceled=1',
      metadata: {
        userId,
        planId,
      },
      client_reference_id: userId,
    });

    console.log('[CHECKOUT] Session created:', {
      sessionId: session.id,
      userId,
      url: session.url ? 'present' : 'missing',
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (error: any) {
    console.error('[CHECKOUT] Error creating session:', error?.message || error);
    console.error('[CHECKOUT] Stack:', error?.stack);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to create checkout session',
      }),
    };
  }
};
