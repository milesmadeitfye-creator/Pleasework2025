import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUpgradeEligibility } from '../hooks/useUpgradeEligibility';
import { trackMetaEvent } from '../lib/metaTrack';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  trigger?: 'credits' | 'feature' | 'session';
}

export default function UpgradeModal({ isOpen, onClose, trigger = 'feature' }: UpgradeModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { markPromptShown, shouldShowUpgradePrompt } = useUpgradeEligibility();

  if (!isOpen) return null;

  if (!shouldShowUpgradePrompt() && trigger === 'session') {
    return null;
  }

  const handleUpgrade = () => {
    if (!user) {
      navigate('/auth', { state: { returnTo: '/subscriptions' } });
      return;
    }

    markPromptShown();

    // Track modal upgrade click
    try {
      trackMetaEvent('InitiateCheckout', {
        email: user.email,
        customData: {
          value: 19,
          currency: 'USD',
          content_name: 'Subscription - Upgrade Modal',
        },
      });
    } catch (trackError) {
      console.error('[UpgradeModal] Analytics error:', trackError);
    }

    // Track custom event for modal upgrade
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('trackCustom', 'UpgradeModalClicked', {
        source: 'upgrade_modal',
      });
    }

    // Navigate to subscriptions page
    navigate('/subscriptions');
    onClose();
  };

  const handleMaybeLater = () => {
    // Track modal dismissal
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('trackCustom', 'UpgradeModalDismissed', {
        source: 'login_modal',
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md relative">
        <button
          onClick={handleMaybeLater}
          className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center">
          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-lg font-bold text-white">⚡</span>
          </div>

          {trigger === 'credits' ? (
            <>
              <h2 className="text-2xl font-bold mb-3">Running low on credits</h2>
              <p className="text-gray-400 text-sm mb-6">
                You're building something real. Upgrade when you're ready.
              </p>
            </>
          ) : trigger === 'feature' ? (
            <>
              <h2 className="text-2xl font-bold mb-3">You're ready to activate this</h2>
              <p className="text-gray-400 text-sm mb-6">
                This feature is available on paid plans. See what's included.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-3">Ready to level up?</h2>
              <p className="text-gray-400 text-sm mb-6">
                You've been exploring Ghoste. See what's possible with a paid plan.
              </p>
            </>
          )}

          <div className="bg-gray-800/50 rounded-lg p-4 mb-6 text-left">
            <ul className="space-y-2 text-gray-300 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>More credits for Ghoste AI & campaigns</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Advanced automations & tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Priority tools for serious artists/teams</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Unlimited smart links & analytics</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>Meta ads integration & insights</span>
              </li>
            </ul>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleMaybeLater}
              className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Maybe Later
            </button>
            <button
              onClick={handleUpgrade}
              className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
            >
              View Plans
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
