import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { trackMetaEvent } from '../lib/metaTrack';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleUpgrade = () => {
    if (!user) {
      navigate('/auth', { state: { returnTo: '/subscriptions' } });
      return;
    }

    // Track modal upgrade click
    try {
      trackMetaEvent('InitiateCheckout', {
        email: user.email,
        customData: {
          value: 29,
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
          disabled={loading}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center">
          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-lg font-bold text-white">⚡</span>
          </div>

          <h2 className="text-2xl font-bold mb-3">You're out of credits</h2>

          <p className="text-gray-400 text-sm mb-6">
            Subscribe to continue using Ghoste and unlock credit refills + purchases.
          </p>

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

          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

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
              Start 7-day free trial
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
