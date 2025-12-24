import { Handler, HandlerEvent } from '@netlify/functions';
import Stripe from 'stripe';
import { getSupabaseAdmin } from './_supabaseAdmin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const sessionId = event.queryStringParameters?.session_id;

    if (!sessionId) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'session_id required' }),
      };
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error('[VERIFY_SESSION] STRIPE_SECRET_KEY not configured');
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Payment system not configured' }),
      };
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-10-29.clover',
    });

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    console.log('[VERIFY_SESSION] Retrieved session:', {
      sessionId,
      paymentStatus: session.payment_status,
      mode: session.mode,
      metadata: session.metadata,
    });

    // Check if session was paid
    const isPaid = session.payment_status === 'paid';

    if (!isPaid) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paid: false,
          status: session.payment_status,
          entitlementActive: false,
        }),
      };
    }

    // Get userId from session metadata
    const userId = session.metadata?.userId || session.client_reference_id;

    if (!userId) {
      console.warn('[VERIFY_SESSION] No userId found in session metadata');
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paid: true,
          entitlementActive: false,
          error: 'No user ID in session',
        }),
      };
    }

    // Fetch from database
    const supabase = getSupabaseAdmin();

    // Check checkout record
    const { data: checkout, error: dbError } = await supabase
      .from('stripe_checkouts')
      .select('*')
      .eq('stripe_session_id', sessionId)
      .maybeSingle();

    if (dbError) {
      console.error('[VERIFY_SESSION] Database error:', dbError.message);
    }

    // Check user profile for active subscription/plan
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('plan, stripe_subscription_status, stripe_subscription_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('[VERIFY_SESSION] Profile error:', profileError.message);
    }

    // Determine if entitlements are active
    // User has active entitlements if:
    // 1. They have a plan set (operator, growth, label)
    // 2. Their subscription status is active, trialing, or past_due
    const validStatuses = ['active', 'trialing', 'past_due'];
    const hasActivePlan = profile?.plan && profile.plan !== 'free';
    const hasActiveSubscription = profile?.stripe_subscription_status &&
      validStatuses.includes(profile.stripe_subscription_status);

    const entitlementActive = !!(hasActivePlan && hasActiveSubscription);

    console.log('[VERIFY_SESSION] Entitlement check:', {
      userId,
      plan: profile?.plan,
      subscriptionStatus: profile?.stripe_subscription_status,
      entitlementActive,
    });

    // Return verification result
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paid: true,
        entitlementActive,
        mode: session.mode,
        amountTotal: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
        planId: session.metadata?.planId,
        userId,
        checkout: checkout || null,
        profile: profile ? {
          plan: profile.plan,
          subscriptionStatus: profile.stripe_subscription_status,
        } : null,
      }),
    };
  } catch (error: any) {
    console.error('[VERIFY_SESSION] Error:', error?.message || error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to verify session. Please try again.',
      }),
    };
  }
};
