import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Mail, LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    paid: boolean;
    email?: string;
    autoProvisioned?: boolean;
    planId?: string;
    credits?: number;
    pack?: string;
  } | null>(null);
  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  useEffect(() => {
    // If already logged in, redirect to dashboard
    if (user) {
      console.log('[CheckoutSuccess] User already logged in, redirecting to dashboard');
      navigate('/dashboard/overview');
      return;
    }

    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      console.error('[CheckoutSuccess] No session_id in URL');
      setLoading(false);
      return;
    }

    const verifySession = async () => {
      try {
        const response = await fetch(
          `/.netlify/functions/stripe-verify-session?session_id=${sessionId}`
        );

        if (!response.ok) {
          throw new Error('Failed to verify session');
        }

        const data = await response.json();

        console.log('[CheckoutSuccess] Verification result:', data);

        setVerificationResult({
          success: true,
          paid: data.paid,
          email: data.checkout?.email || null,
          autoProvisioned: data.checkout?.metadata?.auto_provisioned || false,
          planId: data.checkout?.metadata?.plan || data.metadata?.planId,
          credits: data.checkout?.metadata?.credits ? parseInt(data.checkout.metadata.credits) : undefined,
          pack: data.checkout?.metadata?.pack || data.metadata?.pack,
        });
      } catch (error: any) {
        console.error('[CheckoutSuccess] Verification error:', error.message);
        setVerificationResult({ success: false, paid: false });
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, [searchParams, navigate, user]);

  const handleResendLink = async () => {
    if (!verificationResult?.email || sendingLink) return;

    setSendingLink(true);
    try {
      const sessionId = searchParams.get('session_id');
      const response = await fetch('/.netlify/functions/auth-send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: verificationResult.email,
          sessionId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setLinkSent(true);
        console.log('[CheckoutSuccess] Magic link sent');
      } else {
        console.error('[CheckoutSuccess] Failed to send link:', data.error);
        alert(data.error || 'Failed to send login link. Please try again.');
      }
    } catch (error: any) {
      console.error('[CheckoutSuccess] Error sending magic link:', error.message);
      alert('Failed to send login link. Please try again.');
    } finally {
      setSendingLink(false);
    }
  };

  const handleGoToLogin = () => {
    const sessionId = searchParams.get('session_id');
    const url = sessionId ? `/auth?mode=signin&checkout=success&session_id=${sessionId}` : '/auth?mode=signin';
    navigate(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-emerald-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Verifying your payment...</p>
        </div>
      </div>
    );
  }

  if (!verificationResult?.success || !verificationResult?.paid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center">
          <div className="text-red-400 text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-2">Payment Not Verified</h1>
          <p className="text-slate-400 mb-6">
            We couldn't verify your payment. Please contact support if you were charged.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const isSubscription = !!verificationResult.planId && !verificationResult.credits;
  const isTokenPurchase = !!verificationResult.credits;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-slate-900 rounded-2xl border border-emerald-900/50 p-8">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-emerald-900/30 flex items-center justify-center">
            <CheckCircle className="w-12 h-12 text-emerald-400" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-white text-center mb-2">
          Payment Successful!
        </h1>

        {/* Purchase Details */}
        {isSubscription && (
          <p className="text-center text-slate-400 mb-6">
            Your <span className="text-emerald-400 font-semibold">{verificationResult.planId}</span> subscription is now active.
          </p>
        )}

        {isTokenPurchase && (
          <div className="text-center mb-6">
            <div className="text-2xl font-bold text-emerald-400 mb-1">
              +{verificationResult.credits?.toLocaleString()} Credits
            </div>
            <p className="text-slate-400">
              {verificationResult.pack} pack added to your wallet
            </p>
          </div>
        )}

        {/* Account Created Message */}
        {verificationResult.autoProvisioned && (
          <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-blue-300 mb-1">
                  Account Created ✅
                </h3>
                <p className="text-xs text-blue-200/80 mb-2">
                  We've created your Ghoste account using <span className="font-medium">{verificationResult.email}</span>
                </p>
                <p className="text-xs text-blue-200/60">
                  Check your email to finish setting up your account. Click the link to set your password and access the platform.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {/* Resend Magic Link */}
          {verificationResult.email && (
            <button
              onClick={handleResendLink}
              disabled={sendingLink || linkSent}
              className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {sendingLink ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : linkSent ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Login Link Sent!
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  Resend Login Link
                </>
              )}
            </button>
          )}

          {/* Go to Login */}
          <button
            onClick={handleGoToLogin}
            className="w-full px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            I Already Set My Password
          </button>
        </div>

        {/* Help Text */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Need help? Contact support at{' '}
          <a href="mailto:support@ghoste.one" className="text-emerald-400 hover:underline">
            support@ghoste.one
          </a>
        </p>
      </div>
    </div>
  );
}
