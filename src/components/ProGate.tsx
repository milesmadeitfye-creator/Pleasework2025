import { Crown, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUserPlan } from '../hooks/useUserPlan';
import { useUpgradeEligibility } from '../hooks/useUpgradeEligibility';

interface ProGateProps {
  children: React.ReactNode;
  feature: string;
  action?: string;
  showBadge?: boolean;
  fullPage?: boolean;
}

export function ProGate({ children, feature, action = 'use', showBadge = false, fullPage = false }: ProGateProps) {
  const navigate = useNavigate();
  const { isPro, loading } = useUserPlan();
  const { markPromptShown } = useUpgradeEligibility();

  const handleUpgradeClick = () => {
    markPromptShown();
    navigate('/subscriptions');
  };

  // Allow Ad Campaigns for all users (unlocked feature)
  const isAdCampaignsFeature = feature.toLowerCase().includes('ad campaign') || feature.toLowerCase().includes('meta ad');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Allow access if user is Pro OR if it's the Ad Campaigns feature
  if (isPro || isAdCampaignsFeature) {
    return <>{children}</>;
  }

  if (fullPage) {
    return (
      <div className="px-8 py-12 flex items-center justify-center min-h-[600px]">
        <div className="max-w-lg text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-blue-400" />
          </div>
          <h2 className="text-3xl font-bold text-slate-50 mb-4">
            Upgrade to Ghoste Pro
          </h2>
          <p className="text-lg text-slate-300 mb-8">
            This feature requires a Ghoste Pro subscription. Unlock {feature} and many more powerful tools to grow your music career.
          </p>
          <button
            onClick={handleUpgradeClick}
            className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-lg font-semibold rounded-xl transition-all shadow-lg shadow-blue-900/40"
          >
            View Pro Plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {showBadge && (
        <div className="absolute -top-2 -right-2 z-10 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
          <Crown className="w-3 h-3" />
          PRO
        </div>
      )}
      <div className="relative">
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-10 rounded-lg flex items-center justify-center">
          <div className="text-center p-6 max-w-md">
            <Crown className="w-12 h-12 text-blue-400 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-slate-50 mb-2">Pro Feature</h3>
            <p className="text-slate-300 mb-4">
              Upgrade to Pro to {action} {feature}
            </p>
            <button
              onClick={handleUpgradeClick}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg transition-all"
            >
              Upgrade to Pro
            </button>
          </div>
        </div>
        <div className="opacity-30 pointer-events-none">
          {children}
        </div>
      </div>
    </div>
  );
}

interface ProActionButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  feature: string;
  className?: string;
  disabled?: boolean;
}

export function ProActionButton({ onClick, children, feature, className = '', disabled = false }: ProActionButtonProps) {
  const navigate = useNavigate();
  const { isPro } = useUserPlan();
  const { markPromptShown } = useUpgradeEligibility();

  const handleClick = () => {
    if (isPro) {
      onClick();
    } else {
      markPromptShown();
      navigate('/subscriptions');
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`${className} ${isPro ? '' : 'relative'}`}
    >
      {children}
      {!isPro && (
        <Crown className="w-4 h-4 ml-2 text-yellow-500 inline-block" />
      )}
    </button>
  );
}
