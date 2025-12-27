import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '@/lib/supabase.client';

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'needs_signup'>('loading');
  const [error, setError] = useState<string>('');
  const [plan, setPlan] = useState<string>('operator');

  useEffect(() => {
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      setStatus('error');
      setError('Missing session ID. Please contact support.');
      return;
    }

    const finalizeCheckout = async () => {
      try {
        console.log('[checkout-success] Finalizing checkout for session:', sessionId);

        // Get auth token if user is logged in
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };

        if (user) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
          }
        }

        const response = await fetch('/.netlify/functions/stripe-finalize-checkout', {
          method: 'POST',
          headers,
          body: JSON.stringify({ session_id: sessionId })
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.message || 'Failed to finalize checkout');
        }

        if (data.needs_signup) {
          // User needs to sign up first
          console.log('[checkout-success] User needs to sign up');
          setStatus('needs_signup');
          // Store session ID for later
          localStorage.setItem('pendingCheckoutSession', sessionId);
          setTimeout(() => navigate('/auth?mode=signup&next=/checkout/success'), 2000);
          return;
        }

        // Success! User is subscribed
        console.log('[checkout-success] Subscription finalized');
        setPlan(data.plan || 'growth');
        setStatus('success');

        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          navigate(data.redirect || '/dashboard/overview');
        }, 2000);

      } catch (err: any) {
        console.error('[checkout-success] Error:', err);
        setStatus('error');
        setError(err.message || 'Failed to finalize subscription. Please contact support.');
      }
    };

    finalizeCheckout();
  }, [searchParams, navigate, user]);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {status === 'loading' && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-[#60a5fa]/20 rounded-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#60a5fa] animate-spin" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Processing your subscription</h1>
            <p className="text-white/60">Please wait while we finalize your account...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Welcome to Ghoste!</h1>
            <p className="text-white/60 mb-4">
              Your {plan} subscription is active with a 7-day free trial.
            </p>
            <p className="text-sm text-white/40">Redirecting to your dashboard...</p>
          </div>
        )}

        {status === 'needs_signup' && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-[#60a5fa]/20 rounded-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#60a5fa] animate-spin" />
            </div>
            <h1 className="text-2xl font-bold mb-2">One more step</h1>
            <p className="text-white/60 mb-4">
              Please create your account to complete the subscription.
            </p>
            <p className="text-sm text-white/40">Redirecting to sign up...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
            <p className="text-white/60 mb-6">{error}</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => navigate('/dashboard/overview')}
                className="bg-[#60a5fa] hover:bg-[#3b82f6] text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => navigate('/')}
                className="bg-white/10 hover:bg-white/20 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Back to Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
