import type { PlanId } from './plans';
import { supabase } from '@/lib/supabase.client';

/**
 * Start Stripe checkout for a subscription plan
 * @param planId - The plan to checkout (artist, growth, or scale)
 * @default growth - The $29/mo most popular plan
 */
export async function startCheckout(planId: PlanId = 'growth') {
  try {
    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession();

    const headers: Record<string, string> = {
      "content-type": "application/json"
    };

    // Add auth token if available
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const res = await fetch("/.netlify/functions/stripe-create-checkout", {
      method: "POST",
      headers,
      body: JSON.stringify({
        plan: planId,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Checkout failed:", data);

      // Handle specific error cases
      if (data?.error === 'missing_stripe_config') {
        alert(`Stripe not configured: ${data.message}\n\nPlease contact support.`);
        return;
      }

      throw new Error(data?.message || data?.error || "Checkout failed");
    }

    if (!data?.ok || !data?.url) {
      console.error("Missing checkout url:", data);
      throw new Error("Missing checkout url");
    }

    // Redirect to Stripe checkout
    window.location.href = data.url;
  } catch (e: any) {
    console.error('[startCheckout] Error:', e);
    alert(`Checkout failed: ${e.message}\n\nPlease try again or contact support.`);
    throw e;
  }
}

/**
 * Start checkout with pre-signup flow for unauthenticated users
 * @param planId - The plan to checkout (artist, growth, or scale)
 * @default growth - The $29/mo most popular plan
 */
export async function startCheckoutWithSignup(planId: PlanId = 'growth') {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // Store pending checkout and redirect to signup
      localStorage.setItem('pendingCheckoutPlan', planId);
      window.location.href = '/auth?mode=signup&next=/pricing';
      return;
    }

    // User is logged in, proceed with checkout
    return startCheckout(planId);
  } catch (e: any) {
    console.error('[startCheckoutWithSignup] Error:', e);
    throw e;
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use startCheckout('growth') instead
 */
export async function startCheckout59() {
  return startCheckout('growth');
}
