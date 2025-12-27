import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, Zap, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '@/lib/supabase.client';
import * as ownerMetaPixel from '../lib/ownerMetaPixel';
import { PLANS, type PlanId } from '../lib/plans';

type StripePrice = {
  price_id: string;
  unit_amount: number;
  currency: string;
  interval: string;
};

type PlanData = {
  key: PlanId;
  title: string;
  tagline: string;
  credits: string;
  price: string;
  priceAmount: number;
  bullets: string[];
  highlighted?: boolean;
  stripePriceId: string;
};

type UserSubscription = {
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  stripe_customer_id?: string;
};

const fallbackPlans: PlanData[] = [
  {
    key: 'artist',
    title: 'Artist',
    tagline: 'For emerging artists',
    credits: '30,000 credits / month',
    price: '$9/mo',
    priceAmount: 9,
    stripePriceId: 'price_1SieEYCmFCKCWOjb4AwhF9b4',
    bullets: [
      'Smart Links + Tracking',
      'Pre-Save Campaigns',
      'Basic Analytics',
      'Email Capture',
      'Fan Communication',
      '7-day free trial included',
    ],
  },
  {
    key: 'growth',
    title: 'Growth',
    tagline: 'For serious independents',
    credits: '65,000 credits / month',
    price: '$19/mo',
    priceAmount: 19,
    stripePriceId: 'price_1SieFYCmFCKCWOjbI2wXKbR7',
    bullets: [
      'Everything in Artist',
      'Ad Campaign Manager',
      'Advanced Analytics',
      'Ghoste AI Assistant',
      'Video Tools',
      'Priority Support',
      '7-day free trial included',
    ],
    highlighted: true,
  },
  {
    key: 'scale',
    title: 'Scale',
    tagline: 'For teams & labels',
    credits: '500,000 credits / month',
    price: '$49/mo',
    priceAmount: 49,
    stripePriceId: 'price_1SieFzCmFCKCWOjbPDYABycm',
    bullets: [
      'Everything in Growth',
      'Team Collaboration',
      'High Credit Allocation',
      'Custom Integrations',
      'Dedicated Support',
      'White Label Options',
      '7-day free trial included',
    ],
  },
];

export default function SubscriptionsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanData[]>(fallbackPlans);
  const [pricesLoading, setPricesLoading] = useState(true);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState<PlanId | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      const missing = [];
      if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
      if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');

      console.error('[SubscriptionsPage] Missing Supabase env vars:', missing);
      setError(
        `Missing Supabase configuration: ${missing.join(', ')}. ` +
        `Add these environment variables to continue.`
      );
    }
  }, []);

  useEffect(() => {
    try {
      if (typeof ownerMetaPixel.trackPageView === 'function') {
        ownerMetaPixel.trackPageView();
      }
      if (typeof ownerMetaPixel.trackCustom === 'function') {
        ownerMetaPixel.trackCustom('ViewSubscriptions', {
          path: location.pathname,
        });
      }
    } catch (err) {
      console.error('[SubscriptionsPage] Pixel tracking failed:', err);
    }

    const params = new URLSearchParams(location.search);
    const checkoutResult = params.get('checkout');

    if (checkoutResult === 'success') {
      setSuccess('Welcome to Ghoste! Your trial has started. You can manage your subscription below.');
      window.history.replaceState({}, '', '/subscriptions');
    } else if (checkoutResult === 'cancel' || checkoutResult === 'canceled') {
      setError('Checkout was canceled. No charges were made.');
      window.history.replaceState({}, '', '/subscriptions');
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!user) {
      setSubLoading(false);
      return;
    }

    const fetchSubscription = async () => {
      try {
        const { data: billingData, error: billingError } = await supabase
          .from('user_billing_v2')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (billingError) {
          console.error('[SubscriptionsPage] Error fetching billing:', billingError);
        } else if (billingData) {
          setSubscription({
            status: billingData.status,
            current_period_end: billingData.current_period_end,
            cancel_at_period_end: billingData.cancel_at_period_end || false,
            stripe_customer_id: billingData.stripe_customer_id,
          });

          if (billingData.plan_key && billingData.plan_key !== 'free') {
            setCurrentPlan(billingData.plan_key as PlanId);
          }
        }
      } catch (err) {
        console.error('[SubscriptionsPage] Error loading subscription:', err);
      } finally {
        setSubLoading(false);
      }
    };

    fetchSubscription();
  }, [user]);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        console.log('[SubscriptionsPage] Fetching prices...');
        const response = await fetch('/.netlify/functions/stripe-prices-list');

        const data = await response.json();
        console.log('[SubscriptionsPage] Prices response:', {
          ok: response.ok,
          status: response.status,
          data,
        });

        if (!response.ok || !data.ok || !data.prices) {
          console.warn('[SubscriptionsPage] Failed to fetch prices, using fallback');
          setPricesLoading(false);
          return;
        }

        const stripePrices = data.prices;
        const updatedPlans = fallbackPlans.map((fallbackPlan) => {
          const stripePrice = stripePrices[fallbackPlan.key];

          if (stripePrice && stripePrice.unit_amount) {
            return {
              ...fallbackPlan,
              price: `$${(stripePrice.unit_amount / 100).toFixed(0)}/mo`,
              priceAmount: stripePrice.unit_amount / 100,
              stripePriceId: stripePrice.price_id,
            };
          }

          return fallbackPlan;
        });

        console.log('[SubscriptionsPage] Loaded', updatedPlans.length, 'plans');
        setPlans(updatedPlans);
        setPricesLoading(false);
      } catch (err: any) {
        console.error('[SubscriptionsPage] Error fetching Stripe prices:', err);
        setPricesLoading(false);
      }
    };

    fetchPrices();
  }, []);

  const onStartTrial = async (priceId: string, planKey: PlanId) => {
    if (!user) {
      navigate('/auth', { state: { returnTo: `/subscriptions?plan=${planKey}` } });
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(planKey);

    try {
      if (typeof ownerMetaPixel.trackCustom === 'function') {
        ownerMetaPixel.trackCustom('StartTrialClick', { plan: planKey, priceId });
      }
    } catch (err) {
      console.error('[SubscriptionsPage] Pixel tracking failed:', err);
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Please sign in again to start checkout');
      }

      const response = await fetch('/.netlify/functions/stripe-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ price_id: priceId }),
      });

      const responseData = await response.json();

      if (!response.ok || !responseData.ok) {
        console.error('[SubscriptionsPage] Checkout error:', {
          status: response.status,
          responseBody: responseData,
        });

        const errorMessage = responseData.details || responseData.error || 'Unknown error';
        throw new Error(errorMessage);
      }

      if (!responseData.url) {
        throw new Error('No checkout URL received. Please try again.');
      }

      window.location.assign(responseData.url);
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      console.error('[SubscriptionsPage] Checkout error:', err);
      setError(`Failed to start checkout: ${errorMessage}`);
      setLoading(null);
    }
  };

  const handleManageBilling = async () => {
    if (!user || !subscription?.stripe_customer_id) {
      setError('No active subscription found');
      return;
    }

    setPortalLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Please sign in again');
      }

      const response = await fetch('/.netlify/functions/stripe-portal-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.details || data.error || 'Failed to open billing portal');
      }

      window.location.assign(data.url);
    } catch (err: any) {
      console.error('[SubscriptionsPage] Portal error:', err);
      setError(`Failed to open billing portal: ${err.message}`);
      setPortalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-ghoste-black via-ghoste-navy to-ghoste-black text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        {success && (
          <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
            <div className="flex items-start gap-3">
              <Check className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-green-200">Success!</div>
                <div className="mt-1 text-sm text-green-300">{success}</div>
              </div>
              <button
                onClick={() => setSuccess(null)}
                className="text-green-400 hover:text-green-200 transition-colors"
              >
                <span className="text-xl">×</span>
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-red-200">Error</div>
                <div className="mt-1 text-sm text-red-300">{error}</div>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-200 transition-colors"
              >
                <span className="text-xl">×</span>
              </button>
            </div>
            <div className="mt-3 flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="text-sm text-red-300 hover:text-red-100 underline"
              >
                Refresh Page
              </button>
            </div>
          </div>
        )}

        {!subLoading && subscription && subscription.status === 'active' && currentPlan && (
          <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-500/10 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Zap className="h-5 w-5 text-blue-400" />
                  <div className="font-semibold text-blue-200">
                    Current Plan: {PLANS[currentPlan].name}
                  </div>
                </div>
                <div className="text-sm text-blue-300">
                  {subscription.cancel_at_period_end ? (
                    <>
                      Your subscription will cancel on {new Date(subscription.current_period_end).toLocaleDateString()}
                    </>
                  ) : (
                    <>
                      Next billing date: {new Date(subscription.current_period_end).toLocaleDateString()}
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={handleManageBilling}
                disabled={portalLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {portalLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    Manage Billing
                    <ExternalLink className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="mt-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Choose your plan
          </h1>
          <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
            {subscription?.status === 'active' ? (
              <>Upgrade or change your plan below</>
            ) : (
              <>
                Start with a <span className="text-white font-semibold">7-day free trial</span>.
                After trial, your subscription unlocks refills and credit purchases.
              </>
            )}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {pricesLoading ? (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-white/10 bg-black/40 p-6 lg:p-8 animate-pulse">
                  <div className="h-4 bg-white/10 rounded w-24 mb-4"></div>
                  <div className="h-8 bg-white/10 rounded w-32 mb-2"></div>
                  <div className="h-12 bg-white/10 rounded w-40 mb-6"></div>
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((j) => (
                      <div key={j} className="h-4 bg-white/10 rounded"></div>
                    ))}
                  </div>
                  <div className="mt-8 h-12 bg-white/10 rounded-xl"></div>
                </div>
              ))}
            </>
          ) : (
            plans.map((p) => {
              const isCurrentPlan = currentPlan === p.key;
              const canUpgrade = !isCurrentPlan && subscription?.status === 'active';

              return (
                <div
                  key={p.key}
                  className={`rounded-2xl border p-6 lg:p-8 shadow-2xl transition-all hover:scale-[1.02] ${
                    p.highlighted
                      ? 'border-ghoste-blue bg-gradient-to-br from-ghoste-blue/20 to-ghoste-navy/40 relative'
                      : isCurrentPlan
                      ? 'border-green-500/50 bg-gradient-to-br from-green-500/10 to-ghoste-navy/40'
                      : 'border-white/10 bg-black/40'
                  }`}
                >
                  {p.highlighted && !isCurrentPlan && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-ghoste-blue to-cyan-500 px-4 py-1 text-xs font-semibold text-white shadow-lg">
                      Most Popular
                    </div>
                  )}

                  {isCurrentPlan && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-1 text-xs font-semibold text-white shadow-lg">
                      Current Plan
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Zap className="h-4 w-4" />
                    {p.tagline}
                  </div>

                  <div className="mt-4">
                    <h3 className="text-3xl font-bold">{p.title}</h3>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-4xl font-bold">{p.price}</span>
                      {!isCurrentPlan && <span className="text-white/60">after trial</span>}
                    </div>
                    <div className="mt-2 text-white/80 font-medium">{p.credits}</div>
                  </div>

                  <ul className="mt-6 space-y-3">
                    {p.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3 text-sm text-white/80">
                        <Check className="h-5 w-5 flex-shrink-0 text-green-400 mt-0.5" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrentPlan ? (
                    <button
                      onClick={handleManageBilling}
                      disabled={portalLoading}
                      className="mt-8 w-full rounded-xl font-semibold py-3.5 transition-all bg-white/10 text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {portalLoading ? 'Opening portal...' : 'Manage subscription'}
                    </button>
                  ) : (
                    <button
                      onClick={() => onStartTrial(p.stripePriceId, p.key)}
                      disabled={loading !== null}
                      className={`mt-8 w-full rounded-xl font-semibold py-3.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        p.highlighted
                          ? 'bg-gradient-to-r from-ghoste-blue to-cyan-500 text-white hover:shadow-[0_0_30px_rgba(26,108,255,0.6)]'
                          : 'bg-white text-black hover:bg-white/90'
                      }`}
                    >
                      {loading === p.key
                        ? canUpgrade
                          ? 'Switching plan...'
                          : 'Starting trial...'
                        : canUpgrade
                        ? `Switch to ${p.title}`
                        : 'Start 7-day free trial'}
                    </button>
                  )}

                  {!isCurrentPlan && (
                    <div className="mt-3 text-center text-xs text-white/50">
                      {canUpgrade ? 'Changes take effect immediately' : 'Trial converts to paid unless canceled'}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="mt-12 mx-auto max-w-4xl rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-ghoste-blue/20 p-2">
              <Zap className="h-5 w-5 text-ghoste-blue" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-white">Free tier available</div>
              <div className="mt-2 text-sm text-white/70">
                Free users get <span className="text-white font-semibold">7,500 credits/month</span>.
                When those credits are spent, you'll need a subscription to continue.
                Credit purchases are available only with an active subscription.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <details className="group rounded-xl border border-white/10 bg-black/30 p-4">
              <summary className="cursor-pointer font-semibold text-white list-none flex items-center justify-between">
                Can I cancel anytime?
                <span className="text-white/50 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-3 text-sm text-white/70">
                Yes. Cancel anytime during or after your trial. No questions asked.
              </p>
            </details>

            <details className="group rounded-xl border border-white/10 bg-black/30 p-4">
              <summary className="cursor-pointer font-semibold text-white list-none flex items-center justify-between">
                What happens after my trial?
                <span className="text-white/50 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-3 text-sm text-white/70">
                Your subscription automatically converts to paid unless you cancel. You'll be charged the monthly rate for your chosen plan.
              </p>
            </details>

            <details className="group rounded-xl border border-white/10 bg-black/30 p-4">
              <summary className="cursor-pointer font-semibold text-white list-none flex items-center justify-between">
                Can I upgrade or downgrade?
                <span className="text-white/50 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-3 text-sm text-white/70">
                Yes. Change plans anytime from your billing settings. Upgrades take effect immediately, downgrades at the next billing cycle.
              </p>
            </details>

            <details className="group rounded-xl border border-white/10 bg-black/30 p-4">
              <summary className="cursor-pointer font-semibold text-white list-none flex items-center justify-between">
                Do unused credits roll over?
                <span className="text-white/50 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="mt-3 text-sm text-white/70">
                No. Monthly credits reset at the start of each billing cycle. Purchase additional credits if you need more.
              </p>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
