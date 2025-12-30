import { Handler, HandlerEvent } from '@netlify/functions';
import Stripe from 'stripe';
import { createHash } from 'crypto';
import { getSupabaseAdmin } from './_supabaseAdmin';
import { AutomationEventLogger } from './_automationEvents';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, stripe-signature',
};

// Helper to apply subscription entitlements via RPC
async function applySubscriptionEntitlements(
  supabase: any,
  params: {
    userId: string;
    planKey: string;
    status: string;
    priceId?: string | null;
    currentPeriodEnd?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    cancelAtPeriodEnd?: boolean;
  }
) {
  try {
    const { error } = await supabase.rpc('apply_subscription_entitlements_v2', {
      p_user_id: params.userId,
      p_plan_key: params.planKey,
      p_status: params.status,
      p_price_id: params.priceId || null,
      p_current_period_end: params.currentPeriodEnd || null,
      p_stripe_customer_id: params.stripeCustomerId || null,
      p_stripe_subscription_id: params.stripeSubscriptionId || null,
      p_cancel_at_period_end: params.cancelAtPeriodEnd || false,
    });

    if (error) {
      console.error('[WEBHOOK] apply_subscription_entitlements_v2 error:', error);
      throw error;
    }

    console.log('[WEBHOOK] Applied entitlements:', params.userId, params.planKey, params.status);
  } catch (err: any) {
    console.error('[WEBHOOK] Failed to apply entitlements:', err.message);
    throw err;
  }
}

// Helper function to send Meta CAPI events for Ghoste One pixel
async function sendMetaCapiEvent(params: {
  eventName: string;
  eventId: string;
  email?: string;
  value?: number;
  currency?: string;
  contentType?: string;
  contentName?: string;
  customData?: Record<string, any>;
}) {
  const pixelId = process.env.GHOSTE_META_PIXEL_ID;
  const accessToken = process.env.GHOSTE_META_CAPI_TOKEN;
  const testEventCode = process.env.GHOSTE_META_TEST_EVENT_CODE;

  if (!pixelId || !accessToken) {
    console.warn('[META_CAPI] Pixel ID or access token not configured, skipping event');
    return;
  }

  try {
    const eventTime = Math.floor(Date.now() / 1000);
    const siteUrl = process.env.URL || 'https://ghoste.one';

    const userData: any = {};
    if (params.email) {
      // Hash email for privacy
      userData.em = createHash('sha256').update(params.email.toLowerCase().trim()).digest('hex');
    }

    const eventData: any = {
      event_name: params.eventName,
      event_time: eventTime,
      event_id: params.eventId,
      event_source_url: siteUrl,
      action_source: 'website',
      user_data: userData,
    };

    if (params.value !== undefined) {
      eventData.custom_data = {
        value: params.value,
        currency: params.currency || 'USD',
        ...(params.contentType && { content_type: params.contentType }),
        ...(params.contentName && { content_name: params.contentName }),
        ...params.customData,
      };
    }

    const payload = {
      data: [eventData],
      ...(testEventCode && { test_event_code: testEventCode }),
    };

    const response = await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        access_token: accessToken,
      }),
    });

    const result = await response.json();
    if (response.ok) {
      console.log('[META_CAPI] Event sent successfully:', params.eventName, params.eventId, result);
    } else {
      console.error('[META_CAPI] Event failed:', params.eventName, result);
    }
  } catch (error: any) {
    console.error('[META_CAPI] Error sending event:', error?.message || error);
  }
}

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
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecretKey || !webhookSecret) {
      console.error('[WEBHOOK] Missing Stripe configuration');
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Stripe configuration missing' }),
      };
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-10-29.clover',
    });

    const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
    if (!signature) {
      console.error('[WEBHOOK] Missing stripe-signature header');
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing stripe-signature header' }),
      };
    }

    // Netlify may deliver base64-encoded body for webhooks
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '');

    let stripeEvent: Stripe.Event;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );
    } catch (err) {
      console.error('[WEBHOOK] Signature verification failed:', err instanceof Error ? err.message : 'Unknown error');
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid signature' }),
      };
    }

    const supabase = getSupabaseAdmin();

    console.log('[WEBHOOK] Processing event:', stripeEvent.type, 'id:', stripeEvent.id);

    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        let userId = session.metadata?.userId || session.metadata?.user_id || session.client_reference_id || null;
        const planId = session.metadata?.planId || 'growth'; // Default to growth if not specified
        const customerId = session.customer as string | null;
        const subscriptionId = session.subscription as string | null;
        const amountTotal = session.amount_total ?? 0;

        // Extract buyer email
        const buyerEmail = session.customer_details?.email || session.customer_email || null;

        console.log('[WEBHOOK] checkout.session.completed:', {
          sessionId: session.id,
          userId,
          buyerEmail: buyerEmail ? 'present' : 'missing',
          planId,
          customerId: customerId ? 'present' : 'missing',
          subscriptionId: subscriptionId ? 'present' : 'missing',
          amountTotal,
          mode: session.mode
        });

        // AUTO-PROVISION USER IF MISSING
        if (!userId && buyerEmail) {
          console.log('[WEBHOOK] No userId provided, attempting to auto-provision user for:', buyerEmail);

          try {
            // Check if user already exists by email
            const { data: existingUser, error: lookupError } = await supabase.auth.admin.listUsers();

            if (!lookupError && existingUser) {
              const foundUser = existingUser.users.find(u => u.email?.toLowerCase() === buyerEmail.toLowerCase());

              if (foundUser) {
                // User exists - use their ID
                userId = foundUser.id;
                console.log('[WEBHOOK] Found existing user:', userId);
              } else {
                // Create new user with invite
                const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                  email: buyerEmail,
                  email_confirm: true, // Auto-confirm email
                  user_metadata: {
                    auto_provisioned: true,
                    provisioned_from: 'stripe_checkout',
                    stripe_session_id: session.id,
                  }
                });

                if (createError) {
                  console.error('[WEBHOOK] Failed to create user:', createError.message);
                } else if (newUser?.user) {
                  userId = newUser.user.id;
                  console.log('[WEBHOOK] Created new user:', userId);

                  // Send magic link for password setup
                  try {
                    const siteUrl = process.env.SITE_BASE_URL || process.env.URL || 'https://ghoste.one';
                    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(buyerEmail, {
                      redirectTo: `${siteUrl}/checkout/success?session_id=${session.id}`,
                    });

                    if (inviteError) {
                      console.error('[WEBHOOK] Failed to send invite email:', inviteError.message);
                    } else {
                      console.log('[WEBHOOK] Sent invite email to:', buyerEmail);
                    }
                  } catch (inviteErr: any) {
                    console.error('[WEBHOOK] Invite error:', inviteErr.message);
                  }

                  // Create profile record
                  await supabase.from('profiles').insert({
                    id: userId,
                    email: buyerEmail,
                    plan: subscriptionId ? planId : 'free',
                    stripe_customer_id: customerId,
                    stripe_subscription_id: subscriptionId,
                  });
                }
              }
            }
          } catch (provisionError: any) {
            console.error('[WEBHOOK] Auto-provision error:', provisionError.message);
          }
        }

        if (!userId) {
          console.error('[WEBHOOK] Could not determine or create userId for session', { sessionId: session.id, buyerEmail });
          // Still return 200 to acknowledge webhook, but log the issue
          return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ received: true }),
          };
        }

        // Store customer ID in billing_customers table
        if (customerId) {
          await supabase
            .from('billing_customers')
            .upsert({
              user_id: userId,
              stripe_customer_id: customerId,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
        }

        // Handle subscription checkout
        if (subscriptionId) {
          // Fetch full subscription details
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: '2025-10-29.clover',
          });
          const sub = await stripe.subscriptions.retrieve(subscriptionId);

          // Extract plan_key from metadata
          const planKey = session.metadata?.plan_key || sub.metadata?.plan_key || 'artist';
          const priceId = sub.items.data[0]?.price?.id || null;

          // Apply entitlements via RPC (handles billing_v2, credits, profiles)
          try {
            await applySubscriptionEntitlements(supabase, {
              userId,
              planKey,
              status: sub.status,
              priceId,
              currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              cancelAtPeriodEnd: sub.cancel_at_period_end,
            });

            // Log automation event for successful upgrade (triggers email decider)
            if (sub.status === 'active') {
              await AutomationEventLogger.upgraded(userId, planKey).catch(err => {
                console.error('[WEBHOOK] Failed to log automation event:', err);
              });
            }
          } catch (entError: any) {
            console.error('[WEBHOOK] Entitlement error:', entError.message);
          }

          // Maintain legacy billing_subscriptions table for backward compat
          await supabase
            .from('billing_subscriptions')
            .upsert({
              user_id: userId,
              stripe_subscription_id: subscriptionId,
              status: sub.status,
              current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
              cancel_at_period_end: sub.cancel_at_period_end,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

          // Update stripe_checkouts status with metadata
          await supabase
            .from('stripe_checkouts')
            .update({
              status: 'paid',
              user_id: userId,
              email: buyerEmail,
              metadata: {
                auto_provisioned: !session.metadata?.userId,
                plan: planId,
              }
            })
            .eq('stripe_session_id', session.id);

          // Send Meta CAPI Purchase event for subscription
          const customerEmail = session.customer_details?.email || null;
          if (customerEmail) {
            await sendMetaCapiEvent({
              eventName: 'Purchase',
              eventId: `stripe_${stripeEvent.id}`,
              email: customerEmail,
              value: amountTotal / 100,
              currency: session.currency?.toUpperCase() || 'USD',
              contentType: 'subscription',
              contentName: `Ghoste One ${planId} Subscription`,
            });
          }
        }

        // Handle token purchase (payment mode, no subscription, type=token_purchase)
        if (session.mode === 'payment' && session.metadata?.type === 'token_purchase') {
          const credits = parseInt(session.metadata?.credits || '0');
          const pack = session.metadata?.pack || 'Unknown';

          console.log('[WEBHOOK] Token purchase detected:', {
            sessionId: session.id,
            credits,
            pack,
            userId,
            hasEmail: !!buyerEmail,
          });

          // Update stripe_checkouts status with metadata
          await supabase
            .from('stripe_checkouts')
            .update({
              status: 'paid',
              user_id: userId,
              email: buyerEmail,
              metadata: {
                auto_provisioned: !session.metadata?.userId,
                pack,
                credits,
              }
            })
            .eq('stripe_session_id', session.id);

          // Credit wallet if user is known
          if (userId && credits > 0) {
            try {
              // Check for duplicate credit
              const extRef = `stripe_${session.id}`;
              const { data: existing } = await supabase
                .from('wallet_transactions')
                .select('transaction_id')
                .eq('external_reference', extRef)
                .maybeSingle();

              if (!existing) {
                // Credit wallet using RPC function
                await supabase.rpc('wallet_top_up', {
                  p_user_id: userId,
                  p_amount: credits,
                  p_budget_type: 'MANAGER',
                  p_reference_feature: `Token Purchase - ${pack}`,
                  p_external_reference: extRef,
                });
                console.log('[WEBHOOK] Credited wallet:', userId, credits, 'credits');
              } else {
                console.log('[WEBHOOK] Skipped duplicate credit:', extRef);
              }
            } catch (walletError: any) {
              console.error('[WEBHOOK] Wallet credit failed:', walletError.message);
            }
          } else if (!userId && credits > 0) {
            // Store credits for later linking in metadata
            await supabase
              .from('stripe_checkouts')
              .update({
                metadata: {
                  ...session.metadata,
                  credits_pending: true,
                },
              })
              .eq('stripe_session_id', session.id);
            console.log('[WEBHOOK] Credits pending for email:', buyerEmail);
          }

          // Send Meta CAPI events for token purchase
          if (buyerEmail) {
            const value = amountTotal / 100;

            // Send custom TokenPurchase event
            await sendMetaCapiEvent({
              eventName: 'TokenPurchase',
              eventId: `stripe_${stripeEvent.id}_token`,
              email: buyerEmail,
              value,
              currency: session.currency?.toUpperCase() || 'USD',
              contentType: 'credits',
              contentName: `Token Pack - ${pack}`,
              customData: { credits },
            });

            // Also send standard Purchase event
            await sendMetaCapiEvent({
              eventName: 'Purchase',
              eventId: `stripe_${stripeEvent.id}`,
              email: buyerEmail,
              value,
              currency: session.currency?.toUpperCase() || 'USD',
              contentType: 'credits',
              contentName: `Token Pack - ${pack}`,
            });
          }
        }

        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const subscription = stripeEvent.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status;

        console.log('[WEBHOOK] subscription event:', stripeEvent.type, {
          subscriptionId: subscription.id,
          customerId,
          status,
        });

        const { data: profile, error: fetchError } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (fetchError || !profile) {
          console.error('[WEBHOOK] User not found for customerId:', customerId);
          return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ received: true }),
          };
        }

        // Extract plan_key from metadata
        const planKey = subscription.metadata?.plan_key || 'artist';
        const priceId = subscription.items.data[0]?.price?.id || null;

        // Apply entitlements via RPC
        try {
          await applySubscriptionEntitlements(supabase, {
            userId: profile.id,
            planKey,
            status: subscription.status,
            priceId,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          });
        } catch (entError: any) {
          console.error('[WEBHOOK] Entitlement error:', entError.message);
        }

        // Maintain legacy billing_subscriptions table
        await supabase
          .from('billing_subscriptions')
          .upsert({
            user_id: profile.id,
            stripe_subscription_id: subscription.id,
            status: subscription.status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        console.log('[WEBHOOK] customer.subscription.deleted:', {
          subscriptionId: subscription.id,
          customerId,
        });

        const { data: profile, error: fetchError } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (fetchError || !profile) {
          console.error('[WEBHOOK] User not found for customerId:', customerId);
          return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ received: true }),
          };
        }

        // Apply free tier entitlements via RPC
        try {
          await applySubscriptionEntitlements(supabase, {
            userId: profile.id,
            planKey: 'free',
            status: 'canceled',
            priceId: null,
            currentPeriodEnd: null,
            stripeCustomerId: customerId,
            stripeSubscriptionId: null,
            cancelAtPeriodEnd: false,
          });
        } catch (entError: any) {
          console.error('[WEBHOOK] Entitlement error:', entError.message);
        }

        // Delete from legacy billing_subscriptions table
        await supabase
          .from('billing_subscriptions')
          .delete()
          .eq('stripe_subscription_id', subscription.id);

        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = stripeEvent.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;
        const billingReason = invoice.billing_reason;

        if (subscriptionId) {
          console.log('[WEBHOOK] invoice.payment_succeeded for subscription:', subscriptionId, 'reason:', billingReason);
          // Subscription payment succeeded - ensure user stays on Pro
          const { data: sub } = await supabase
            .from('billing_subscriptions')
            .select('user_id')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle();

          if (sub) {
            await supabase
              .from('profiles')
              .update({ plan: 'pro' })
              .eq('id', sub.user_id);
            console.log('[WEBHOOK] confirmed pro status for user', sub.user_id);

            // Send Meta CAPI Subscribe event for recurring subscriptions
            if (billingReason === 'subscription_cycle') {
              const customerEmail = invoice.customer_email || null;
              if (customerEmail) {
                await sendMetaCapiEvent({
                  eventName: 'Subscribe',
                  eventId: `stripe_${stripeEvent.id}`,
                  email: customerEmail,
                  value: (invoice.amount_paid || 0) / 100,
                  currency: invoice.currency?.toUpperCase() || 'USD',
                  contentType: 'subscription',
                  contentName: 'Ghoste One Subscription Renewal',
                });
              }
            }
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;

        if (subscriptionId) {
          console.log('[WEBHOOK] invoice.payment_failed for subscription:', subscriptionId);
          // Payment failed - update subscription status
          const { data: sub } = await supabase
            .from('billing_subscriptions')
            .select('user_id')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle();

          if (sub) {
            await supabase
              .from('billing_subscriptions')
              .update({ status: 'past_due', updated_at: new Date().toISOString() })
              .eq('stripe_subscription_id', subscriptionId);
            console.log('[WEBHOOK] marked subscription as past_due for user', sub.user_id);
          }
        }
        break;
      }

      default:
        console.log('[WEBHOOK] unhandled event type', stripeEvent.type);
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ received: true }),
    };
  } catch (error: any) {
    console.error('[WEBHOOK] Fatal error:', error?.message || error);
    console.error('[WEBHOOK] Stack:', error?.stack);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Webhook processing failed' }),
    };
  }
};
