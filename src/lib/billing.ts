/**
 * Billing and Stripe checkout helpers
 */

/**
 * Opens the Stripe checkout flow or billing page
 * Uses VITE_STRIPE_CHECKOUT_URL env var if available, otherwise falls back to /billing
 */
export function openStripeCheckout() {
  const url = import.meta.env.VITE_STRIPE_CHECKOUT_URL || '/billing';

  if (url.startsWith('http')) {
    window.location.href = url;
  } else {
    window.location.href = url;
  }
}

/**
 * Navigates to the billing/wallet page
 */
export function openBillingPage() {
  window.location.href = '/billing';
}
