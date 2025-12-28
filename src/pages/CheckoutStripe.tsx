import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface VerifyResponse {
  paid: boolean;
  entitlementActive: boolean;
  status?: string;
  planId?: string;
  error?: string;
}

export default function CheckoutStripe() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'polling' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying payment...');
  const [pollAttempts, setPollAttempts] = useState(0);

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!sessionId) {
      console.warn('[CheckoutStripe] No session_id in URL');
      navigate('/studio');
      return;
    }

    if (!user) {
      console.warn('[CheckoutStripe] No user logged in, redirecting to login');
      navigate(`/login?resumeStripe=1&session_id=${sessionId}`);
      return;
    }

    verifyPayment();
  }, [sessionId, user]);

  const verifyPayment = async () => {
    if (!sessionId) return;

    try {
      const res = await fetch(`/.netlify/functions/stripe-verify-session?session_id=${sessionId}`);
      const data: VerifyResponse = await res.json();

      console.log('[CheckoutStripe] Verify response:', data);

      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify payment');
      }

      if (!data.paid) {
        setStatus('error');
        setMessage('Payment not completed. Please try again.');
        setTimeout(() => navigate('/subscriptions'), 3000);
        return;
      }

      if (data.entitlementActive) {
        // Entitlements are active, go to dashboard immediately
        console.log('[CheckoutStripe] Entitlements active, routing to dashboard');
        setStatus('success');
        setMessage('Payment successful! Redirecting to dashboard...');
        setTimeout(() => navigate('/studio'), 500);
        return;
      }

      // Payment is successful but entitlements not yet active
      // This can happen if webhook hasn't processed yet
      // Start polling
      if (pollAttempts < 10) {
        setStatus('polling');
        setMessage('Payment received — finishing setup...');
        setPollAttempts(prev => prev + 1);
        console.log('[CheckoutStripe] Polling attempt', pollAttempts + 1);
        setTimeout(() => verifyPayment(), 1500);
        return;
      }

      // Polling timed out, but payment was successful
      // Route to dashboard anyway with a flag
      console.log('[CheckoutStripe] Polling timed out, routing to dashboard with resumeStripe flag');
      setStatus('success');
      setMessage('Payment successful! Setting up your account...');
      setTimeout(() => navigate('/studio?resumeStripe=1'), 500);
    } catch (error: any) {
      console.error('[CheckoutStripe] Verification error:', error);
      setStatus('error');
      setMessage(error.message || 'Failed to verify payment');

      // Still route to dashboard after error, they can retry there
      setTimeout(() => navigate('/studio?resumeStripe=1'), 3000);
    }
  };

  const handleManualContinue = () => {
    navigate('/studio?resumeStripe=1');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          {status === 'verifying' || status === 'polling' ? (
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          ) : status === 'success' ? (
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
          )}
        </div>

        {/* Message */}
        <h1 className="text-2xl font-bold text-center mb-2">
          {status === 'verifying' && 'Verifying Payment'}
          {status === 'polling' && 'Almost There'}
          {status === 'success' && 'Payment Successful'}
          {status === 'error' && 'Verification Failed'}
        </h1>

        <p className="text-center text-slate-400 mb-6">
          {message}
        </p>

        {/* Progress indicator for polling */}
        {status === 'polling' && (
          <div className="mb-6">
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${(pollAttempts / 10) * 100}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 text-center mt-2">
              Setting up your subscription...
            </p>
          </div>
        )}

        {/* Manual continue button for polling timeout */}
        {status === 'polling' && pollAttempts >= 5 && (
          <button
            onClick={handleManualContinue}
            className="w-full px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
          >
            Go to Dashboard
          </button>
        )}

        {/* Auto-redirect message */}
        {(status === 'success' || status === 'error') && (
          <div className="text-center">
            <p className="text-sm text-slate-500">
              {status === 'success' ? 'Redirecting...' : 'Redirecting in a moment...'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
