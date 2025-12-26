import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Suspense } from 'react';
import { lazyWithRecovery } from './lib/lazyWithRecovery';
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { RUNTIME_CONFIG } from './runtimeConfig';

// Public Pages
import LandingPageV2 from './pages/LandingPageV2';
import AuthPage from './components/AuthPage';

// Debug Page (NO AUTH - ALWAYS ACCESSIBLE)
import DebugCrash from './pages/DebugCrash';

// Protected App Shell
import AppShell from './components/layout/AppShell';

// Lazy load protected pages with recovery
const OverviewPage = lazyWithRecovery(() => import('./pages/dashboard/OverviewPage'));
const CalendarPage = lazyWithRecovery(() => import('./pages/CalendarPage'));
const WalletPage = lazyWithRecovery(() => import('./pages/WalletPage'));
const AnalyticsPage = lazyWithRecovery(() => import('./pages/AnalyticsPage'));
const LinksPage = lazyWithRecovery(() => import('./pages/LinksPage'));
const HelpCenter = lazyWithRecovery(() => import('./pages/HelpCenter'));

// Manager & Autopilot
const ManagerPage = lazyWithRecovery(() => import('./pages/ManagerPage'));
const AdsAutopilotPage = lazyWithRecovery(() => import('./pages/studio/AdsAutopilotPage'));
const AdsVerificationInboxPage = lazyWithRecovery(() => import('./pages/studio/AdsVerificationInboxPage'));
const AdsAutopilotLogPage = lazyWithRecovery(() => import('./pages/studio/AdsAutopilotLogPage'));

// Studio pages
const StudioIndex = lazyWithRecovery(() => import('./pages/studio/StudioIndex'));
const GettingStarted = lazyWithRecovery(() => import('./pages/studio/GettingStarted'));
const SmartLinksPage = lazyWithRecovery(() => import('./pages/studio/SmartLinksPage'));
const AdCampaignsPage = lazyWithRecovery(() => import('./pages/studio/AdCampaignsPage'));
const GhosteAIPage = lazyWithRecovery(() => import('./pages/studio/GhosteAIPage'));
const CoverArtPage = lazyWithRecovery(() => import('./pages/studio/CoverArtPage'));
const MusicVisualsPage = lazyWithRecovery(() => import('./pages/studio/MusicVisualsPage'));
const SocialMediaPage = lazyWithRecovery(() => import('./pages/studio/SocialMediaPage'));
const FanCommunicationPage = lazyWithRecovery(() => import('./pages/studio/FanCommunicationPage'));
const ListeningPartiesPage = lazyWithRecovery(() => import('./pages/studio/ListeningPartiesPage'));
const SplitsPage = lazyWithRecovery(() => import('./pages/studio/SplitsPage'));
const UnreleasedMusicPage = lazyWithRecovery(() => import('./pages/studio/UnreleasedMusicPage'));
const AutomationLogsPage = lazyWithRecovery(() => import('./pages/studio/AutomationLogsPage'));

// Profile pages
const ConnectAccountsPage = lazyWithRecovery(() => import('./pages/profile/ConnectAccountsPage'));
const ProfileOverviewPage = lazyWithRecovery(() => import('./pages/profile/ProfileOverviewPage'));

// Public link landing pages
const SmartLinkLanding = lazyWithRecovery(() => import('./components/SmartLinkLanding'));
const BioLinkLanding = lazyWithRecovery(() => import('./pages/BioLinkLanding'));
const ShowLinkLanding = lazyWithRecovery(() => import('./pages/ShowLinkLanding'));
const PreSaveLinkLanding = lazyWithRecovery(() => import('./pages/PreSaveLinkLanding'));
const UnreleasedTrackLanding = lazyWithRecovery(() => import('./pages/UnreleasedTrackLanding'));
const EmailCaptureLanding = lazyWithRecovery(() => import('./pages/EmailCaptureLanding'));
const PublicListeningPartyWebRTC = lazyWithRecovery(() => import('./pages/PublicListeningPartyWebRTC'));
const PublicSplitNegotiation = lazyWithRecovery(() => import('./pages/PublicSplitNegotiation'));
const SplitInviteResponsePage = lazyWithRecovery(() => import('./pages/SplitInviteResponsePage'));
const ListeningPartyHostPage = lazyWithRecovery(() => import('./pages/ListeningPartyHostPage'));

// Success pages
const CheckoutSuccessPage = lazyWithRecovery(() => import('./pages/CheckoutSuccessPage'));
const CheckoutSuccess = lazyWithRecovery(() => import('./pages/CheckoutSuccess'));
const TokensSuccessPage = lazyWithRecovery(() => import('./pages/TokensSuccessPage'));

// Billing pages
const SubscriptionsPage = lazyWithRecovery(() => import('./pages/SubscriptionsPage'));

// 404 page
const AppNotFound = lazyWithRecovery(() => import('./components/AppNotFound'));

// Loading fallback
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-ghoste-navy flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ghoste-accent"></div>
    </div>
  );
}

// Protected Route Wrapper - ONLY checks auth, NOT subscription
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = window.location;

  // Step 1: Wait for auth to hydrate
  if (loading) {
    return <LoadingFallback />;
  }

  // Step 2: If no user, redirect to sign in (preserve intended destination)
  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?mode=signin&returnTo=${returnTo}`} replace />;
  }

  // Step 3: User is authenticated - render page
  return <>{children}</>;
}

function App() {
  if (typeof window !== 'undefined') {
    (window as any).__GHOSTE_CONFIG__ = RUNTIME_CONFIG;
  }

  return (
    <GlobalErrorBoundary>
      <Router>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
          {/* ========================================
              DEBUG ROUTE - ALWAYS ACCESSIBLE (NO AUTH)
              Must be at the top, outside all guards
              ======================================== */}
          <Route path="/debug" element={<DebugCrash />} />

          {/* Public Routes */}
          <Route path="/" element={<LandingPageV2 />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/subscriptions"
            element={
              <RouteErrorBoundary routeName="subscriptions">
                <SubscriptionsPage />
              </RouteErrorBoundary>
            }
          />

          {/* Help Center - Public Access */}
          <Route path="/help" element={<HelpCenter />} />
          <Route path="/help/:category" element={<HelpCenter />} />
          <Route path="/help/:category/:slug" element={<HelpCenter />} />

          {/* Welcome/Tutorial - Protected */}
          <Route
            path="/welcome"
            element={
              <ProtectedRoute>
                <AppShell>
                  <RouteErrorBoundary routeName="welcome">
                    <HelpCenter />
                  </RouteErrorBoundary>
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Dashboard redirect */}
          <Route path="/dashboard" element={<Navigate to="/dashboard/overview" replace />} />

          {/* Protected Dashboard Routes */}
          <Route
            path="/dashboard/overview"
            element={
              <ProtectedRoute>
                <AppShell>
                  <RouteErrorBoundary routeName="overview">
                    <OverviewPage />
                  </RouteErrorBoundary>
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Protected Calendar */}
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <AppShell>
                  <CalendarPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Protected Wallet */}
          <Route
            path="/wallet"
            element={
              <ProtectedRoute>
                <AppShell>
                  <WalletPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Protected Analytics */}
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AnalyticsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Protected Links */}
          <Route
            path="/links"
            element={
              <ProtectedRoute>
                <AppShell>
                  <LinksPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Protected Manager */}
          <Route
            path="/manager"
            element={
              <ProtectedRoute>
                <AppShell>
                  <ManagerPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Protected Ads Routes - NEW ROUTES ADDED */}
          <Route
            path="/ads/autopilot"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AdsAutopilotPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/ads/verification-inbox"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AdsVerificationInboxPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/ads/autopilot-log"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AdsAutopilotLogPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Legacy Routes - Keep for backward compatibility */}
          <Route
            path="/autopilot"
            element={<Navigate to="/ads/autopilot" replace />}
          />

          <Route
            path="/inbox"
            element={<Navigate to="/ads/verification-inbox" replace />}
          />

          <Route
            path="/listening-parties"
            element={<Navigate to="/studio/listening-parties" replace />}
          />

          <Route
            path="/automation-logs"
            element={<Navigate to="/studio/automation-logs" replace />}
          />

          {/* Settings redirect to profile */}
          <Route path="/settings" element={<Navigate to="/profile/overview" replace />} />

          {/* Protected Studio Routes */}
          <Route
            path="/studio"
            element={
              <ProtectedRoute>
                <AppShell>
                  <StudioIndex />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/getting-started"
            element={
              <ProtectedRoute>
                <AppShell>
                  <GettingStarted />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/smart-links"
            element={
              <ProtectedRoute>
                <AppShell>
                  <SmartLinksPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/ad-campaigns"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AdCampaignsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/ghoste-ai"
            element={
              <ProtectedRoute>
                <AppShell>
                  <GhosteAIPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/cover-art"
            element={
              <ProtectedRoute>
                <AppShell>
                  <CoverArtPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/music-visuals"
            element={
              <ProtectedRoute>
                <AppShell>
                  <MusicVisualsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/social-media"
            element={
              <ProtectedRoute>
                <AppShell>
                  <SocialMediaPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/fan-communication"
            element={
              <ProtectedRoute>
                <AppShell>
                  <FanCommunicationPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/listening-parties"
            element={
              <ProtectedRoute>
                <AppShell>
                  <ListeningPartiesPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/listening-parties/host/:partyId"
            element={
              <ProtectedRoute>
                <AppShell>
                  <ListeningPartyHostPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/splits"
            element={
              <ProtectedRoute>
                <AppShell>
                  <SplitsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio/unreleased-music"
            element={
              <ProtectedRoute>
                <AppShell>
                  <UnreleasedMusicPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Studio Ads Management Routes */}
          <Route
            path="/studio/ads-verification"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AdsVerificationInboxPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/studio/verification-inbox"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AdsVerificationInboxPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/studio/ads-autopilot"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AdsAutopilotPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/studio/autopilot-log"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AdsAutopilotLogPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          <Route
            path="/studio/automation-logs"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AutomationLogsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Profile redirect */}
          <Route path="/profile" element={<Navigate to="/profile/overview" replace />} />

          {/* Protected Profile Routes */}
          <Route
            path="/profile/connect-accounts"
            element={
              <ProtectedRoute>
                <AppShell>
                  <ConnectAccountsPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/connect"
            element={<Navigate to="/profile/connect-accounts" replace />}
          />
          <Route
            path="/profile/overview"
            element={
              <ProtectedRoute>
                <AppShell>
                  <ProfileOverviewPage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Public Success Page - must be accessible to unauthenticated users */}
          <Route
            path="/success"
            element={<CheckoutSuccessPage />}
          />
          <Route
            path="/checkout/success"
            element={<CheckoutSuccess />}
          />
          <Route
            path="/tokens-success"
            element={
              <ProtectedRoute>
                <TokensSuccessPage />
              </ProtectedRoute>
            }
          />

          {/* Protected Listening Party Host */}
          <Route
            path="/listening-party/host/:partyId"
            element={
              <ProtectedRoute>
                <ListeningPartyHostPage />
              </ProtectedRoute>
            }
          />

          {/* Public Link Landing Pages (no auth needed) */}
          <Route path="/s/:slug" element={<SmartLinkLanding />} />
          <Route path="/l/:slug" element={<SmartLinkLanding />} />
          <Route path="/link/:slug" element={<SmartLinkLanding />} />
          <Route path="/bio/:slug" element={<BioLinkLanding />} />
          <Route path="/show/:slug" element={<ShowLinkLanding />} />
          <Route path="/presave/:slug" element={<PreSaveLinkLanding />} />
          <Route path="/track/:slug" element={<UnreleasedTrackLanding />} />
          <Route path="/capture/:slug" element={<EmailCaptureLanding />} />
          <Route path="/email/:slug" element={<EmailCaptureLanding />} />
          <Route path="/live/:slug" element={<PublicListeningPartyWebRTC />} />
          <Route path="/split/:token" element={<PublicSplitNegotiation />} />
          <Route path="/splits/invite/:token" element={<SplitInviteResponsePage />} />

          {/* Catch-all 404 - In-app 404 for unknown routes */}
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <AppShell>
                  <AppNotFound />
                </AppShell>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </Router>
    </GlobalErrorBoundary>
  );
}

export default App;