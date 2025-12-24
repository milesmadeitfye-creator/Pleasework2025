import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, Zap, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import * as ownerMetaPixel from '../lib/ownerMetaPixel';

type PlanKey = 'operator' | 'growth' | 'scale';

const plans: Array<{
  key: PlanKey;
  title: string;
  tagline: string;
  credits: string;
  price: string;
  bullets: string[];
  highlighted?: boolean;
}> = [
  {
    key: 'operator',
    title: 'Operator',
    tagline: 'Best for solo artists getting consistent motion.',
    credits: '30,000 credits / month',
    price: '$29/mo',
    bullets: [
      'Smart Links + tracking',
      'Ghoste AI prompts',
      'Core creator tools',
      'Credit purchases enabled',
      '7-day free trial included',
    ],
  },
  {
    key: 'growth',
    title: 'Growth',
    tagline: 'For artists + teams running multiple campaigns.',
    credits: '65,000 credits / month',
    price: '$59/mo',
    bullets: [
      'Everything in Operator',
      'More automation + higher usage',
      'Advanced analytics & workflows',
      'Credit purchases enabled',
      '7-day free trial included',
    ],
    highlighted: true,
  },
  {
    key: 'scale',
    title: 'Scale',
    tagline: 'For heavy usage / label-style operations.',
    credits: 'Unlimited fair use',
    price: '$149/mo',
    bullets: [
      'Everything in Growth',
      'Highest limits',
      'Priority handling',
      'Credit purchases enabled',
      '7-day free trial included',
    ],
  },
];

export default function SubscriptionsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    // Defensive pixel tracking - never crash if pixel fails
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
  }, [location.pathname]);

  const onStartTrial = async (plan: PlanKey) => {
    if (!user) {
      navigate('/auth', { state: { returnTo: `/subscriptions?plan=${plan}` } });
      return;
    }

    // Clear previous errors
    setError(null);
    setLoading(plan);

    // Defensive pixel signal - never crash if pixel fails
    try {
      if (typeof ownerMetaPixel.trackCustom === 'function') {
        ownerMetaPixel.trackCustom('StartTrialClick', { plan });
      }
    } catch (err) {
      console.error('[SubscriptionsPage] Pixel tracking failed:', err);
    }

    try {
      // Get user session for JWT
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Please sign in again to start checkout');
      }

      // Call Netlify function to create Stripe checkout session
      const response = await fetch('/.netlify/functions/stripe-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan }),
      });

      const responseData = await response.json();

      if (!response.ok || !responseData.ok) {
        // Log error to localStorage for /debug
        const crashLog = {
          kind: 'checkout_error',
          time: new Date().toISOString(),
          message: responseData.error || 'Checkout failed',
          status: response.status,
          responseBody: responseData,
          plan,
          path: location.pathname,
        };
        try {
          const existing = localStorage.getItem('__ghoste_last_crash_v1');
          const crashes = existing ? JSON.parse(existing) : [];
          crashes.push(crashLog);
          localStorage.setItem('__ghoste_last_crash_v1', JSON.stringify(crashes.slice(-10)));
        } catch (storageErr) {
          console.error('[SubscriptionsPage] Failed to log to localStorage:', storageErr);
        }

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

      // Redirect to Stripe checkout
      window.location.assign(responseData.url);
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      console.error('[SubscriptionsPage] Checkout error:', err);
      setError(`Failed to start checkout: ${errorMessage}`);
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-ghoste-black via-ghoste-navy to-ghoste-black text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        {/* Error Banner */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-red-200">Checkout Error</div>
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
              <button
                onClick={() => navigate('/debug')}
                className="text-sm text-red-300 hover:text-red-100 underline"
              >
                Debug Console
              </button>
            </div>
          </div>
        )}

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {/* Header */}
        <div className="mt-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Choose your plan
          </h1>
          <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
            Start with a <span className="text-white font-semibold">7-day free trial</span>.
            After trial, your subscription unlocks refills and credit purchases.
          </p>
        </div>

        {/* Plans grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {plans.map((p) => (
            <div
              key={p.key}
              className={`rounded-2xl border p-6 lg:p-8 shadow-2xl transition-all hover:scale-[1.02] ${
                p.highlighted
                  ? 'border-ghoste-blue bg-gradient-to-br from-ghoste-blue/20 to-ghoste-navy/40 relative'
                  : 'border-white/10 bg-black/40'
              }`}
            >
              {p.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-ghoste-blue to-cyan-500 px-4 py-1 text-xs font-semibold text-white shadow-lg">
                  Most Popular
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
                  <span className="text-white/60">after trial</span>
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

              <button
                onClick={() => onStartTrial(p.key)}
                disabled={loading !== null}
                className={`mt-8 w-full rounded-xl font-semibold py-3.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  p.highlighted
                    ? 'bg-gradient-to-r from-ghoste-blue to-cyan-500 text-white hover:shadow-[0_0_30px_rgba(26,108,255,0.6)]'
                    : 'bg-white text-black hover:bg-white/90'
                }`}
              >
                {loading === p.key ? 'Starting trial...' : 'Start 7-day free trial'}
              </button>

              <div className="mt-3 text-center text-xs text-white/50">
                Trial converts to paid unless canceled
              </div>
            </div>
          ))}
        </div>

        {/* Freemium note */}
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

        {/* FAQ */}
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
