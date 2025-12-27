import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';

export default function TokensSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { refetch: refetchProfile } = useUserProfile();
  const [loading, setLoading] = useState(true);
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    credits?: number;
    pack?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    // Initialize Ghoste One Meta Pixel (only on this success page)
    const pixelId = import.meta.env.VITE_GHOSTE_META_PIXEL_ID;
    if (pixelId && !(window as any).fbq) {
      // Load Meta Pixel base code
      (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
        if (f.fbq) return;
        n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = !0;
        n.version = '2.0';
        n.queue = [];
        t = b.createElement(e);
        t.async = !0;
        t.src = v;
        s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

      const fbq = (window as any).fbq;
      fbq('init', pixelId);
      fbq('track', 'PageView');
      console.log('[TokensSuccess] Ghoste Meta Pixel initialized:', pixelId);
    }

    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      setVerificationResult({
        success: false,
        error: 'No session ID provided',
      });
      setLoading(false);
      return;
    }

    const verifySession = async () => {
      try {
        const response = await fetch(
          `/.netlify/functions/stripe-verify-session?session_id=${sessionId}`
        );

        const data = await response.json();

        if (!response.ok || !data.paid) {
          setVerificationResult({
            success: false,
            error: 'Payment not confirmed',
          });
          return;
        }

        // Extract credits and pack info from metadata
        const credits = parseInt(data.metadata?.credits || '0');
        const pack = data.metadata?.pack || 'Unknown';

        setVerificationResult({
          success: true,
          credits,
          pack,
        });

        // Fire Meta Pixel events for client-side tracking
        if (typeof window !== 'undefined' && (window as any).fbq) {
          const fbq = (window as any).fbq;
          const value = data.amountTotal / 100;

          // Custom TokenPurchase event
          fbq('trackCustom', 'TokenPurchase', {
            value,
            currency: data.currency?.toUpperCase() || 'USD',
            content_type: 'credits',
            content_name: `Token Pack - ${pack}`,
          }, {
            eventID: `stripe_${sessionId}_token`,
          });

          // Standard Purchase event
          fbq('track', 'Purchase', {
            value,
            currency: data.currency?.toUpperCase() || 'USD',
            content_type: 'credits',
            content_name: `Token Pack - ${pack}`,
          }, {
            eventID: `stripe_${sessionId}`,
          });
        }

        // Refetch profile to update credits
        refetchProfile();

        // Auto-redirect to wallet after 3 seconds
        setTimeout(() => {
          navigate('/wallet');
        }, 3000);
      } catch (error: any) {
        console.error('[TokensSuccess] Verification error:', error);
        setVerificationResult({
          success: false,
          error: error.message || 'Failed to verify payment',
        });
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, [searchParams, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Verifying Payment...</h1>
          <p className="text-slate-400">Please wait while we confirm your purchase.</p>
        </div>
      </div>
    );
  }

  if (!verificationResult?.success) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 rounded-2xl border border-red-900/50 p-8 text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Payment Issue</h1>
          <p className="text-slate-400 mb-6">
            {verificationResult?.error || 'We couldn\'t verify your payment. Please contact support.'}
          </p>
          <button
            onClick={() => navigate('/wallet')}
            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
          >
            Go to Wallet
          </button>
        </div>
      </div>
    );
  }

  // If user is not logged in, prompt to create account
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 rounded-2xl border border-emerald-900/50 p-8 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Payment Successful!</h1>
          <p className="text-slate-400 mb-6">
            Your {verificationResult.credits?.toLocaleString()} credits are ready to claim.
            Create an account to get started.
          </p>
          <button
            onClick={() => navigate(`/finish-setup?session_id=${searchParams.get('session_id')}`)}
            className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors mb-3"
          >
            Create Account & Claim Credits
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // Success - user is logged in
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 rounded-2xl border border-emerald-900/50 p-8 text-center">
        <div className="relative">
          <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
          <div className="absolute inset-0 blur-2xl bg-emerald-500/20 -z-10"></div>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Credits Added!</h1>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg mb-4">
          <span className="text-2xl font-bold text-emerald-400">
            +{verificationResult.credits?.toLocaleString()}
          </span>
          <span className="text-sm text-emerald-300">Manager Credits</span>
        </div>
        <p className="text-slate-400 mb-6">
          Your {verificationResult.pack} pack has been added to your wallet.
          Redirecting to wallet...
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/wallet')}
            className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            Go to Wallet
          </button>
          <button
            onClick={() => navigate('/app')}
            className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
          >
            Start Creating
          </button>
        </div>
      </div>
    </div>
  );
}
