import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboardingState } from '../../hooks/useOnboardingState';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle2, Circle, Mail, Link2, Music, Bot, X, Sparkles } from 'lucide-react';

export function OnboardingChecklist() {
  const navigate = useNavigate();
  const { user, resendVerificationEmail } = useAuth();
  const { state, loading, markChattedWithAI, dismissOnboarding } = useOnboardingState();
  const [resendingEmail, setResendingEmail] = useState(false);

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-ghoste-navy/20 to-ghoste-blue/20 border border-ghoste-blue/30 rounded-xl p-6 mb-6 animate-pulse">
        <div className="h-6 bg-ghoste-black/70 rounded w-48 mb-2"></div>
        <div className="h-4 bg-ghoste-black/70 rounded w-64"></div>
      </div>
    );
  }

  if (!state || state.dismissed) {
    return null;
  }

  const handleResendEmail = async () => {
    setResendingEmail(true);
    try {
      await resendVerificationEmail();
      alert('Verification email sent! Check your inbox.');
    } catch (err) {
      console.error('Failed to resend email:', err);
      alert('Failed to send email. Please try again.');
    } finally {
      setResendingEmail(false);
    }
  };

  const handleCreateSmartLink = () => {
    navigate('/dashboard?tab=links');
  };

  const handleConnectSpotify = () => {
    navigate('/dashboard?tab=accounts');
  };

  const handleOpenGhosteAI = async () => {
    await markChattedWithAI();
    navigate('/dashboard?tab=ghoste');
  };

  const handleDismiss = async () => {
    await dismissOnboarding();
  };

  const progressPercent = (state.requiredStepsCompleted / 3) * 100;

  return (
    <div className="bg-gradient-to-r from-ghoste-navy/20 to-ghoste-blue/20 border border-ghoste-blue/30 rounded-xl p-6 mb-6 relative">
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-4 right-4 text-ghoste-grey hover:text-ghoste-white transition-colors"
        aria-label="Skip onboarding"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-6 h-6 text-ghoste-blue" />
          <h2 className="text-2xl font-bold text-ghoste-white">Getting started with Ghoste</h2>
        </div>
        <p className="text-ghoste-grey text-sm">
          Complete these quick steps to unlock your account.
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-ghoste-grey">
            {state.requiredStepsCompleted} of 3 required steps completed
          </span>
          <span className="text-sm font-medium text-ghoste-blue">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <div className="w-full bg-ghoste-black/60 rounded-full h-2 overflow-hidden">
          <div
            className="bg-ghoste-blue h-full transition-all duration-500 ease-out shadow-[0_0_12px_rgba(26,108,255,0.6)]"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Checklist items */}
      <div className="space-y-4">
        {/* 1. Confirm email */}
        <div className="flex items-start gap-4 p-4 bg-ghoste-black/20 rounded-lg border border-white/10">
          <div className="flex-shrink-0 mt-1">
            {state.emailConfirmed ? (
              <CheckCircle2 className="w-6 h-6 text-ghoste-blue" />
            ) : (
              <Circle className="w-6 h-6 text-ghoste-grey/40" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="w-4 h-4 text-ghoste-blue" />
              <h3 className="font-semibold text-ghoste-white">Confirm your email</h3>
            </div>
            <p className="text-sm text-ghoste-grey mb-2">
              Verify your email to unlock full access.
            </p>
            {state.emailConfirmed ? (
              <span className="text-sm text-ghoste-blue font-medium">✓ Completed</span>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-ghoste-grey/80">
                  Check your email inbox for the confirmation link.
                </p>
                <button
                  onClick={handleResendEmail}
                  disabled={resendingEmail}
                  className="self-start px-3 py-1.5 text-sm bg-ghoste-blue hover:bg-ghoste-blue/90 disabled:bg-ghoste-black/60 disabled:cursor-not-allowed text-ghoste-white rounded-lg transition-colors"
                >
                  {resendingEmail ? 'Sending...' : 'Resend confirmation email'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 2. Create Smart Link */}
        <div className="flex items-start gap-4 p-4 bg-ghoste-black/20 rounded-lg border border-white/10">
          <div className="flex-shrink-0 mt-1">
            {state.hasSmartLink ? (
              <CheckCircle2 className="w-6 h-6 text-ghoste-blue" />
            ) : (
              <Circle className="w-6 h-6 text-ghoste-grey/40" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="w-4 h-4 text-ghoste-blue" />
              <h3 className="font-semibold text-ghoste-white">Create your first Smart Link</h3>
            </div>
            <p className="text-sm text-ghoste-grey mb-2">
              Share all your music and socials with one link.
            </p>
            {state.hasSmartLink ? (
              <span className="text-sm text-ghoste-blue font-medium">✓ Completed</span>
            ) : (
              <button
                onClick={handleCreateSmartLink}
                className="px-4 py-2 bg-ghoste-blue hover:bg-ghoste-blue/90 text-ghoste-white rounded-lg transition-colors font-medium shadow-[0_0_12px_rgba(26,108,255,0.4)]"
              >
                Create Smart Link
              </button>
            )}
          </div>
        </div>

        {/* 3. Connect Spotify */}
        <div className="flex items-start gap-4 p-4 bg-ghoste-black/20 rounded-lg border border-white/10">
          <div className="flex-shrink-0 mt-1">
            {state.hasConnectedSpotify ? (
              <CheckCircle2 className="w-6 h-6 text-ghoste-blue" />
            ) : (
              <Circle className="w-6 h-6 text-ghoste-grey/40" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Music className="w-4 h-4 text-ghoste-blue" />
              <h3 className="font-semibold text-ghoste-white">Connect your Spotify</h3>
            </div>
            <p className="text-sm text-ghoste-grey mb-2">
              Connect Spotify so Ghoste can pull in your artist profile and tracks.
            </p>
            {state.hasConnectedSpotify ? (
              <span className="text-sm text-ghoste-blue font-medium">✓ Connected</span>
            ) : (
              <button
                onClick={handleConnectSpotify}
                className="px-4 py-2 bg-ghoste-blue hover:bg-ghoste-blue/90 text-ghoste-white rounded-lg transition-colors font-medium shadow-[0_0_12px_rgba(26,108,255,0.4)]"
              >
                Connect Spotify
              </button>
            )}
          </div>
        </div>

        {/* 4. Chat with Ghoste AI (Optional) */}
        <div className="flex items-start gap-4 p-4 bg-ghoste-black/20 rounded-lg border border-white/10">
          <div className="flex-shrink-0 mt-1">
            {state.hasChattedWithAI ? (
              <CheckCircle2 className="w-6 h-6 text-ghoste-blue" />
            ) : (
              <Circle className="w-6 h-6 text-ghoste-grey/40" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Bot className="w-4 h-4 text-ghoste-blue" />
              <h3 className="font-semibold text-ghoste-white">Say hi to Ghoste AI</h3>
              <span className="px-2 py-0.5 text-xs bg-ghoste-black/60 text-ghoste-grey border border-white/10 rounded">
                Optional
              </span>
            </div>
            <p className="text-sm text-ghoste-grey mb-2">
              Ask questions and get ideas for your first campaign.
            </p>
            {state.hasChattedWithAI ? (
              <span className="text-sm text-ghoste-blue font-medium">✓ Completed</span>
            ) : (
              <button
                onClick={handleOpenGhosteAI}
                className="px-4 py-2 bg-ghoste-black/60 hover:bg-ghoste-black text-ghoste-white rounded-lg transition-colors font-medium border border-white/10"
              >
                Open Ghoste AI
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-6 border-t border-white/10">
        {state.allRequiredComplete ? (
          <div className="flex items-center gap-2 text-ghoste-blue">
            <Sparkles className="w-5 h-5" />
            <p className="font-medium">
              🔥 You're all set — your Ghoste journey starts now.
            </p>
          </div>
        ) : (
          <p className="text-sm text-ghoste-grey">
            Complete these steps to get the most out of Ghoste.
          </p>
        )}
      </div>
    </div>
  );
}
