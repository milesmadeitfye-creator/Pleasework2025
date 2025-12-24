import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, X, CreditCard, Check, Loader2, ExternalLink } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { trackMetaEvent } from '../lib/metaTrack';
import { supabase } from '../lib/supabase';

type BillingStatus = 'loading' | 'free' | 'pro';

export default function Billing() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>('loading');

  const isPro = billingStatus === 'pro';

  useEffect(() => {
    const status = searchParams.get('status');
    if (status === 'success') {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } else if (status === 'cancel') {
      setShowCancel(true);
      setTimeout(() => setShowCancel(false), 5000);
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchBillingStatus = async () => {
      if (!user) {
        setBillingStatus('free');
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setBillingStatus('free');
          return;
        }

        const response = await fetch('/.netlify/functions/get-billing-status', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          console.error('[Billing] Failed to fetch billing status');
          setBillingStatus('free');
          return;
        }

        const data = await response.json();
        setBillingStatus(data.plan === 'pro' ? 'pro' : 'free');
      } catch (err) {
        console.error('[Billing] Error fetching billing status:', err);
        setBillingStatus('free');
      }
    };

    fetchBillingStatus();
  }, [user]);


  const handleUpgrade = async () => {
    setError(null);
    setLoading(true);

    try {
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Track InitiateCheckout via Pixel + CAPI
      try {
        trackMetaEvent('InitiateCheckout', {
          email: user.email,
          customData: {
            value: 9.99,
            currency: 'USD',
            num_items: 1,
            content_name: 'Ghoste Pro Plan',
          },
        });
      } catch (trackError) {
        console.error('[Billing] Error tracking InitiateCheckout:', trackError);
      }

      console.log('[Billing] Creating checkout session for user:', user.id);

      const response = await fetch('/.netlify/functions/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id }),
      });

      const contentType = response.headers.get('content-type');

      if (!response.ok) {
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          console.error('[Billing] Checkout error:', data.error);
          throw new Error(data.error || 'Failed to create checkout session');
        } else {
          const text = await response.text();
          console.error('[Billing] Non-JSON response:', text.substring(0, 200));
          throw new Error('Server returned an invalid response. Please check your Stripe configuration.');
        }
      }

      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('[Billing] Expected JSON but got:', text.substring(0, 200));
        throw new Error('Server configuration error. Please contact support.');
      }

      const data = await response.json();

      if (!data.url) {
        console.error('[Billing] No checkout URL in response:', data);
        throw new Error('Failed to get checkout URL');
      }

      console.log('[Billing] Opening Stripe checkout in new tab');
      const popup = window.open(data.url, '_blank', 'noopener,noreferrer');

      if (!popup) {
        throw new Error('Pop-up blocked. Please allow pop-ups for this site and try again.');
      }

      setLoading(false);
    } catch (err) {
      console.error('[Billing] Error creating checkout:', err);
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
      setLoading(false);
    }
  };

  if (billingStatus === 'loading') {
    return (
      <div className="px-8 py-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Checking your plan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-50 mb-2">
        Billing & Subscription
      </h1>
      <p className="text-slate-400 mb-8">
        Manage your Ghoste subscription and billing information.
      </p>

      {showSuccess && (
        <div className="mb-6 p-4 bg-emerald-900/50 border border-emerald-700 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-emerald-100 font-medium">Welcome to Ghoste Pro!</p>
            <p className="text-emerald-200/80 text-sm">Your subscription is now active. Refresh the page to see your updated plan.</p>
          </div>
          <button
            onClick={() => setShowSuccess(false)}
            className="ml-auto text-emerald-200 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {showCancel && (
        <div className="mb-6 p-4 bg-slate-800 border border-slate-700 rounded-xl flex items-center gap-3">
          <X className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <p className="text-slate-300 text-sm">Checkout canceled. You can upgrade anytime.</p>
          <button
            onClick={() => setShowCancel(false)}
            className="ml-auto text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-50">Current Plan</h2>
              <p className="text-sm text-slate-400 mt-1">
                {isPro ? 'You have access to all Pro features' : 'You are on the free plan'}
              </p>
            </div>
            <div className={`px-4 py-2 rounded-full text-sm font-medium ${
              isPro
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-slate-700/50 text-slate-400 border border-slate-600'
            }`}>
              {isPro ? 'Pro' : 'Free'}
            </div>
          </div>
        </div>

        {!isPro && (
          <div className="bg-gradient-to-br from-blue-900/40 to-purple-900/40 border border-blue-700/50 rounded-2xl p-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-slate-50 mb-2">
                  Upgrade to Ghoste Pro
                </h3>
                <p className="text-slate-300 mb-6">
                  Unlock powerful features to grow your music career and connect with fans.
                </p>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 text-slate-200">
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-sm">Connect Meta & Instagram Ads accounts</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-200">
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-sm">Advanced analytics & streaming insights</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-200">
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-sm">Unlimited smart links & custom domains</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-200">
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-sm">Priority support & early feature access</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-200">
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-sm">Fan communication & community tools</span>
                  </div>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm text-red-200">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleUpgrade}
                  disabled={loading}
                  className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-medium transition flex items-center gap-2 shadow-lg shadow-blue-900/40"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Starting checkout...
                    </>
                  ) : (
                    'Upgrade to Pro'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {isPro && (
          <>
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-slate-50 mb-4">
                Pro Features Unlocked
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Meta Ads Integration</p>
                    <p className="text-xs text-slate-500 mt-1">Connect Facebook & Instagram ad accounts</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Advanced Analytics</p>
                    <p className="text-xs text-slate-500 mt-1">Track streams, saves, and engagement</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Smart Links</p>
                    <p className="text-xs text-slate-500 mt-1">Unlimited custom links & domains</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">Priority Support</p>
                    <p className="text-xs text-slate-500 mt-1">Get help when you need it</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-50 mb-1">
                    Manage Billing
                  </h3>
                  <p className="text-sm text-slate-400">
                    Update payment method or cancel subscription
                  </p>
                </div>
                <button
                  onClick={() => {
                    alert('Stripe Customer Portal integration coming soon!');
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition flex items-center gap-2"
                >
                  Manage
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
