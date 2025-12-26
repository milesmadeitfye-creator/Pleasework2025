import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { loadAppConfig } from './_lib/appSecrets';

/**
 * Create Stripe Customer Portal session
 * Allows users to manage their subscription, payment methods, and billing
 */

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
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Load app configuration from app_secrets
    let config;
    try {
      config = await loadAppConfig();
    } catch (configErr: any) {
      console.error('[stripe-portal-create] Config load error:', configErr);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Configuration error',
          details: configErr.message || 'Failed to load app configuration',
        }),
      };
    }

    if (!config.STRIPE_SECRET_KEY) {
      console.error('[stripe-portal-create] Missing STRIPE_SECRET_KEY');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
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
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const jwt = authHeader.replace('Bearer ', '');

    // Validate user session
    const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: 'Unauthorized',
          details: authError?.message || 'Invalid session',
        }),
      };
    }

    // Get user profile to find Stripe customer ID
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    const stripeCustomerId = profile?.stripe_customer_id;

    if (!stripeCustomerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'No subscription found',
          details: 'You must have an active subscription to access billing portal',
        }),
      };
    }

    // Initialize Stripe
    const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia',
    });

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${config.APP_BASE_URL}/subscriptions`,
    });

    console.log('[stripe-portal-create] Portal session created:', {
      sessionId: session.id,
      userId: user.id,
      customerId: stripeCustomerId,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        url: session.url,
      }),
    };
  } catch (err: any) {
    console.error('[stripe-portal-create] Error:', err);

    if (err.type === 'StripeInvalidRequestError') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid request',
          details: err.message,
        }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to create portal session',
        details: err.message || String(err),
      }),
    };
  }
};
