import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { useUserPlan } from '../hooks/useUserPlan';
import { CheckCircle } from 'lucide-react';
import AppShell from './layout/AppShell';
import FanCommunication from './FanCommunication';
import AdsManager from './AdsManager';
import CoverArtGenerator from './CoverArtGenerator';
import SocialPoster from './SocialPoster';
import StatsDashboard from './StatsDashboard';
import ConnectedAccounts from './ConnectedAccounts';
import AccountSettings from './AccountSettings';
import GhosteAI from './GhosteAI';
import UnreleasedMusic from './UnreleasedMusic';
import MarketingUniversity from './MarketingUniversity';
import ListeningParties from './ListeningParties';
import SplitNegotiations from './SplitNegotiations';
import Billing from '../pages/Billing';
import CoverArt from '../pages/CoverArt';
import EmailVerificationBanner from './EmailVerificationBanner';
import LinksUnified from './LinksUnified';
import WalletPage from '../pages/WalletPage';
import GhosteStudio from '../pages/Studio';
import AdsDiagnostics from './AdsDiagnostics';
import UpgradeModal from './UpgradeModal';
import { EmailConfirmGate } from './EmailConfirmGate';
import { OnboardingChecklist } from './onboarding/OnboardingChecklist';
import { useOnboardingState } from '../hooks/useOnboardingState';
import CalendarPage from '../pages/CalendarPage';
import AnalyticsPage from '../pages/AnalyticsPage';

type TabType = 'dashboard' | 'links' | 'fans' | 'ads' | 'cover-art' | 'ai-cover-art' | 'social' | 'accounts' | 'settings' | 'ghoste' | 'unreleased' | 'university' | 'listening-parties' | 'splits' | 'billing' | 'wallet' | 'studio' | 'calendar' | 'analytics';

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('ghoste');
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(false);
  const [showMetaSuccess, setShowMetaSuccess] = useState(false);
  const [showWelcomeUpgradeModal, setShowWelcomeUpgradeModal] = useState(false);
  const { signOut, user, emailConfirmed } = useAuth();
  const { isPro } = useUserPlan();
  const { state: onboardingState, loading: onboardingLoading } = useOnboardingState();
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user) {
        const nameFromMeta = user.user_metadata?.full_name || user.user_metadata?.name;
        if (nameFromMeta) {
          setUserName(nameFromMeta);
        } else {
          const email = user.email || '';
          setUserName(email.split('@')[0]);
        }
      }
    };
    fetchUserProfile();
  }, [user]);

  useEffect(() => {
    // Handle tab parameter from URL
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      const validTabs: TabType[] = ['dashboard', 'links', 'fans', 'ads', 'cover-art', 'ai-cover-art', 'social', 'accounts', 'settings', 'ghoste', 'unreleased', 'university', 'listening-parties', 'splits', 'billing', 'wallet', 'studio', 'calendar', 'analytics'];
      if (validTabs.includes(tabParam as TabType)) {
        setActiveTab(tabParam as TabType);
      }
    }

    if (searchParams.get('upgraded') === 'true') {
      setActiveTab('accounts');
      setShowUpgradeSuccess(true);

      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('upgraded');
      newSearchParams.delete('session_id');
      setSearchParams(newSearchParams, { replace: true });

      setTimeout(() => {
        setShowUpgradeSuccess(false);
      }, 5000);
    }

    if (searchParams.get('meta') === 'connected') {
      setShowMetaSuccess(true);

      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('meta');
      setSearchParams(newSearchParams, { replace: true });

      setTimeout(() => {
        setShowMetaSuccess(false);
      }, 8000);
    }
  }, [searchParams, setSearchParams]);

  // Show upgrade modal on first dashboard visit for free users
  // Paywall temporarily disabled for engagement data collection
  useEffect(() => {
    const paywallEnabled = import.meta.env.VITE_PAYWALL_ENABLED === 'true';

    if (paywallEnabled && user && !isPro) {
      const hasSeenWelcome = localStorage.getItem('ghoste_seen_welcome_upgrade');
      if (!hasSeenWelcome) {
        // Show modal after 2 seconds delay
        const timer = setTimeout(() => {
          setShowWelcomeUpgradeModal(true);
          localStorage.setItem('ghoste_seen_welcome_upgrade', 'true');
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [user, isPro]);


  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <>
            <StatsDashboard />
            <div className="mt-6">
              <AdsDiagnostics />
            </div>
          </>
        );
      case 'ghoste':
        return (
          <EmailConfirmGate>
            <GhosteAI />
          </EmailConfirmGate>
        );
      case 'links':
        return (
          <EmailConfirmGate>
            <LinksUnified />
          </EmailConfirmGate>
        );
      case 'ai-cover-art':
        return (
          <EmailConfirmGate>
            <CoverArt />
          </EmailConfirmGate>
        );
      case 'listening-parties':
        return (
          <EmailConfirmGate>
            <ListeningParties />
          </EmailConfirmGate>
        );
      case 'studio':
        return (
          <EmailConfirmGate>
            <GhosteStudio />
          </EmailConfirmGate>
        );
      case 'splits':
        return (
          <EmailConfirmGate>
            <SplitNegotiations />
          </EmailConfirmGate>
        );
      case 'unreleased':
        return (
          <EmailConfirmGate>
            <UnreleasedMusic />
          </EmailConfirmGate>
        );
      case 'fans':
        return (
          <EmailConfirmGate>
            <FanCommunication />
          </EmailConfirmGate>
        );
      case 'ads':
        return (
          <EmailConfirmGate>
            <AdsManager />
          </EmailConfirmGate>
        );
      case 'cover-art':
        return (
          <EmailConfirmGate>
            {user ? <CoverArtGenerator userId={user.id} /> : <div>Loading...</div>}
          </EmailConfirmGate>
        );
      case 'social':
        return (
          <EmailConfirmGate>
            <SocialPoster />
          </EmailConfirmGate>
        );
      case 'university':
        return <MarketingUniversity />;
      case 'accounts':
        return <ConnectedAccounts onNavigateToBilling={() => setActiveTab('billing')} />;
      case 'billing':
        return <Billing />;
      case 'wallet':
        return <WalletPage />;
      case 'calendar':
        return <CalendarPage />;
      case 'analytics':
        return <AnalyticsPage />;
      case 'settings':
        return <AccountSettings />;
      default:
        return <StatsDashboard />;
    }
  };

  return (
    <AppShell>
      <EmailVerificationBanner />

      {user && !emailConfirmed && (
        <div className="w-full bg-amber-500/10 border-b border-amber-500/30 px-4 py-3 text-sm text-amber-200">
          <strong>Heads up:</strong> You need to confirm your email to unlock all Ghoste features.
          Check your inbox for a link. Once confirmed, refresh this page.
        </div>
      )}

      <div className="min-h-[calc(100vh-4rem)]">
        {showUpgradeSuccess && (
          <div className="max-w-7xl mx-auto px-4 md:px-8 pt-6">
            <div className="mb-6 p-4 bg-emerald-900/50 border border-emerald-700 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-emerald-100 font-medium">Welcome to Ghoste Pro!</p>
                <p className="text-emerald-200/80 text-sm">Your account has been upgraded. You can now connect your Meta Ads account below.</p>
              </div>
            </div>
          </div>
        )}
        {showMetaSuccess && (
          <div className="max-w-7xl mx-auto px-4 md:px-8 pt-6">
            <div className="mb-6 p-4 bg-emerald-900/50 border border-emerald-700 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-emerald-100 font-medium">Facebook account connected successfully!</p>
                <p className="text-emerald-200/80 text-sm">Ads features will unlock once Meta approves required permissions.</p>
              </div>
            </div>
          </div>
        )}

        {/* Onboarding Checklist - only show on dashboard tab */}
        {activeTab === 'dashboard' && user && !onboardingLoading && onboardingState && !onboardingState.dismissed && !onboardingState.allRequiredComplete && (
          <div className="max-w-7xl mx-auto px-4 md:px-8 pt-6">
            <OnboardingChecklist />
          </div>
        )}

        {renderContent()}
      </div>

      <UpgradeModal
        isOpen={showWelcomeUpgradeModal}
        onClose={() => setShowWelcomeUpgradeModal(false)}
      />
    </AppShell>
  );
}
