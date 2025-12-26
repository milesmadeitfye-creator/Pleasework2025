/**
 * Billing and Stripe checkout helpers
 */

/**
 * Opens the subscriptions page to view and select plans
 */
export function openStripeCheckout() {
  window.location.href = '/subscriptions';
}

/**
 * Navigates to the billing/wallet page
 */
export function openBillingPage() {
  window.location.href = '/billing';
}
