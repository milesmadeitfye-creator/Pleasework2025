import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageShell } from '../../components/layout/PageShell';
import { StudioTabs } from '../../components/studio/StudioTabs';
import { OnboardingChecklist } from '../../components/onboarding/OnboardingChecklist';
import { GettingStartedInternalTools } from '../../components/studio/GettingStartedInternalTools';
import { Loader2, CheckCircle, RefreshCw } from 'lucide-react';
import { useUserProfile } from '../../hooks/useUserProfile';

export default function GettingStartedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isPro, isLoading: profileLoading, refetch } = useUserProfile();
  const [verifying, setVerifying] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  const resumeStripe = searchParams.get('resumeStripe');
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (resumeStripe === '1' && !isPro && !profileLoading) {
      setShowBanner(true);
      // Try to verify payment one more time
      if (sessionId) {
        verifyPaymentStatus();
      }
    } else if (isPro) {
      // If user is Pro, remove the banner and params
      setShowBanner(false);
      if (resumeStripe) {
        searchParams.delete('resumeStripe');
        searchParams.delete('session_id');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [resumeStripe, isPro, profileLoading, sessionId]);

  const verifyPaymentStatus = async () => {
    if (!sessionId) return;

    setVerifying(true);
    try {
      const res = await fetch(`/.netlify/functions/stripe-verify-session?session_id=${sessionId}`);
      const data = await res.json();

      if (data.entitlementActive) {
        // Entitlements are now active, refresh profile
        await refetch();
        setShowBanner(false);
        // Remove query params
        searchParams.delete('resumeStripe');
        searchParams.delete('session_id');
        setSearchParams(searchParams, { replace: true });
      }
    } catch (error) {
      console.error('[GettingStarted] Payment verification error:', error);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <PageShell title="Ghoste Studio">
      <StudioTabs />
      <div className="max-w-5xl space-y-6">
        {/* Payment Setup Banner */}
        {showBanner && !isPro && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {verifying ? (
                  <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-emerald-300 mb-1">
                  {verifying ? 'Finishing Setup...' : 'Payment Received'}
                </h3>
                <p className="text-xs text-emerald-400/70 mb-3">
                  {verifying
                    ? 'Activating your subscription and setting up your account...'
                    : 'Your payment was successful! We\'re activating your subscription.'}
                </p>
                {!verifying && sessionId && (
                  <button
                    onClick={verifyPaymentStatus}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Check Status
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <section className="space-y-2">
          <h1 className="text-lg font-semibold tracking-tight text-ghoste-white">
            Getting Started
          </h1>
          <p className="text-[11px] text-ghoste-grey">
            This is your setup toolbox. Complete these modules to wire your core tools, automations, and campaigns into Ghoste One.
          </p>
        </section>

        <OnboardingChecklist />

        <GettingStartedInternalTools />
      </div>
    </PageShell>
  );
}
