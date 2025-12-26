import { supabase } from '../supabase';

export interface CheckoutOptions {
  priceId: string;
}

export interface CheckoutResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Start Stripe checkout session
 * Redirects to Stripe on success
 * Throws on error
 */
export async function startCheckout(options: CheckoutOptions): Promise<void> {
  const { priceId } = options;

  if (!priceId) {
    throw new Error('Price ID is required');
  }

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('You must be signed in to start checkout');
  }

  const token = session.access_token;

  const response = await fetch('/.netlify/functions/stripe-checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      price_id: priceId,
    }),
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    const errorMessage = result.error || result.details || 'Failed to create checkout session';
    console.error('[startCheckout] Error:', errorMessage);
    throw new Error(errorMessage);
  }

  if (!result.url) {
    throw new Error('No checkout URL returned');
  }

  console.log('[startCheckout] Redirecting to Stripe:', result.url);
  window.location.href = result.url;
}
