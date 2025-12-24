import { Handler, HandlerEvent } from '@netlify/functions';
import Stripe from 'stripe';

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
    const siteUrl = process.env.URL || 'https://ghoste.one';

    if (!stripeSecretKey) {
      console.error('[OPERATOR_CHECKOUT] STRIPE_SECRET_KEY not configured');
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Payment system not configured' }),
      };
    }

    console.log('[OPERATOR_CHECKOUT] Looking up Operator price ($29/mo)...');

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-10-29.clover',
    });

    // Try to find Operator price by metadata first
    let operatorPriceId: string | null = null;

    try {
      const prices = await stripe.prices.list({
        active: true,
        type: 'recurring',
        limit: 100,
      });

      // Strategy 1: Look for metadata.tier="operator" or metadata.plan="operator"
      const priceByMetadata = prices.data.find(
        (price) =>
          price.metadata?.tier === 'operator' ||
          price.metadata?.plan === 'operator' ||
          price.metadata?.name?.toLowerCase() === 'operator'
      );

      if (priceByMetadata) {
        operatorPriceId = priceByMetadata.id;
        console.log('[OPERATOR_CHECKOUT] Found Operator price by metadata:', operatorPriceId);
      } else {
        // Strategy 2: Fallback to amount lookup ($29/mo = 2900 cents)
        const priceByAmount = prices.data.find(
          (price) =>
            price.unit_amount === 2900 &&
            price.currency === 'usd' &&
            price.recurring?.interval === 'month'
        );

        if (priceByAmount) {
          operatorPriceId = priceByAmount.id;
          console.log('[OPERATOR_CHECKOUT] Found Operator price by amount ($29/mo):', operatorPriceId);
        }
      }
    } catch (err: any) {
      console.warn('[OPERATOR_CHECKOUT] Error looking up prices:', err?.message);
    }

    if (!operatorPriceId) {
      console.error('[OPERATOR_CHECKOUT] Operator price not found');
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Operator subscription plan not found. Please contact support.',
        }),
      };
    }

    console.log('[OPERATOR_CHECKOUT] Creating checkout session for Operator plan...');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: operatorPriceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true, // Enable promo codes (for 50% off founding discount)
      subscription_data: {
        trial_period_days: 7, // 7-day trial
      },
      success_url: `${siteUrl}/app?checkout=success`,
      cancel_url: `${siteUrl}/?checkout=cancel`,
    });

    console.log('[OPERATOR_CHECKOUT] Session created:', {
      sessionId: session.id,
      priceId: operatorPriceId,
      url: session.url ? 'present' : 'missing',
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (error: any) {
    console.error('[OPERATOR_CHECKOUT] Error creating session:', error?.message || error);
    console.error('[OPERATOR_CHECKOUT] Stack:', error?.stack);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to create checkout session. Please try again.',
      }),
    };
  }
};
