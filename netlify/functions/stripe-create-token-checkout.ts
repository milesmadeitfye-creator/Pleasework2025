import { Handler, HandlerEvent } from '@netlify/functions';
import Stripe from 'stripe';
import { getSupabaseAdmin } from './_supabaseAdmin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Token pack configurations
const TOKEN_PACKS = {
  starter: {
    credits: 10000,
    price_cents: 999,
    label: 'Starter',
  },
  growth: {
    credits: 25000,
    price_cents: 2499,
    label: 'Growth',
  },
  power: {
    credits: 50000,
    price_cents: 3999,
    label: 'Power',
  },
} as const;

type TokenPack = keyof typeof TOKEN_PACKS;

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
      console.error('[TOKEN_CHECKOUT] STRIPE_SECRET_KEY not configured');
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Payment system not configured' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const pack = body.pack as TokenPack;
    const returnUrlBase = body.return_url_base || siteUrl;
    const userId = body.userId || null;
    const userEmail = body.userEmail || null;

    // Validate pack
    if (!pack || !TOKEN_PACKS[pack]) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid pack. Must be starter, growth, or power' }),
      };
    }

    const packConfig = TOKEN_PACKS[pack];
    console.log('[TOKEN_CHECKOUT] Creating checkout for pack:', pack, packConfig);

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-10-29.clover',
    });

    // Map pack to Stripe price ID (from env vars)
    const priceIdEnvKey = `STRIPE_TOKEN_PRICE_${pack.toUpperCase()}_${packConfig.price_cents}`;
    let priceId = process.env[priceIdEnvKey];

    // If price ID not in env, try to find or create it
    if (!priceId) {
      console.log('[TOKEN_CHECKOUT] Price ID not found in env, looking up or creating...');

      try {
        const prices = await stripe.prices.list({
          active: true,
          limit: 100,
        });

        // Find price by metadata
        const existingPrice = prices.data.find(
          (price) =>
            price.metadata?.pack === pack &&
            price.metadata?.type === 'token_purchase' &&
            price.unit_amount === packConfig.price_cents
        );

        if (existingPrice) {
          priceId = existingPrice.id;
          console.log('[TOKEN_CHECKOUT] Found existing price:', priceId);
        } else {
          // Create product and price
          const product = await stripe.products.create({
            name: `${packConfig.label} Token Pack`,
            description: `${packConfig.credits.toLocaleString()} Manager Credits`,
            metadata: {
              pack,
              credits: packConfig.credits.toString(),
              type: 'token_purchase',
            },
          });

          const newPrice = await stripe.prices.create({
            product: product.id,
            unit_amount: packConfig.price_cents,
            currency: 'usd',
            metadata: {
              pack,
              credits: packConfig.credits.toString(),
              type: 'token_purchase',
            },
          });

          priceId = newPrice.id;
          console.log('[TOKEN_CHECKOUT] Created new price:', priceId);
        }
      } catch (err: any) {
        console.error('[TOKEN_CHECKOUT] Error looking up/creating price:', err?.message);
      }
    }

    if (!priceId) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Token pack price not configured' }),
      };
    }

    // Create checkout session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${returnUrlBase}/tokens/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrlBase}/wallet?checkout=cancel`,
      metadata: {
        type: 'token_purchase',
        category: 'wallet_refill',
        pack: packConfig.label,
        credits: packConfig.credits.toString(),
      },
    };

    // If user is logged in, include their details
    if (userId) {
      sessionParams.client_reference_id = userId;
    }

    if (userEmail) {
      sessionParams.customer_email = userEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log('[TOKEN_CHECKOUT] Session created:', {
      sessionId: session.id,
      pack,
      credits: packConfig.credits,
      priceId,
      url: session.url ? 'present' : 'missing',
    });

    // Store checkout in database
    const supabase = getSupabaseAdmin();
    const { error: dbError } = await supabase
      .from('stripe_checkouts')
      .insert({
        stripe_session_id: session.id,
        stripe_customer_id: session.customer as string | null,
        plan: `token_${pack}`,
        status: 'created',
        user_id: userId,
        email: userEmail,
        metadata: {
          pack: packConfig.label,
          credits: packConfig.credits,
          price_cents: packConfig.price_cents,
        },
      });

    if (dbError) {
      console.error('[TOKEN_CHECKOUT] Failed to store checkout:', dbError.message);
      // Don't fail the request - checkout session is still valid
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (error: any) {
    console.error('[TOKEN_CHECKOUT] Error creating session:', error?.message || error);
    console.error('[TOKEN_CHECKOUT] Stack:', error?.stack);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to create checkout session. Please try again.',
      }),
    };
  }
};
