import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from '@/contexts/AdminAuthContext';
import AdminGuard from '@/components/AdminGuard';
import Shell from '@/components/Shell';
import PlaceholderPage from '@/pages/PlaceholderPage';

const OverviewPage = lazy(() => import('@/pages/OverviewPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));

function RouteLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand-600" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <AdminGuard>
          <Routes>
            <Route element={<Shell />}>
              <Route
                index
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <OverviewPage />
                  </Suspense>
                }
              />
              <Route
                path="users"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <UsersPage />
                  </Suspense>
                }
              />
              <Route
                path="ai"
                element={
                  <PlaceholderPage
                    title="AI System Monitor"
                    subtitle="Request timeline, intent parsing, tool calls, replay & inject."
                    phase="Phase 2"
                  />
                }
              />
              <Route
                path="creatives"
                element={
                  <PlaceholderPage
                    title="AI Ad Creative Pipeline"
                    subtitle="Claude → Sora → Google APIs → Remotion."
                    phase="Phase 3"
                  />
                }
              />
              <Route
                path="ads"
                element={
                  <PlaceholderPage
                    title="Meta Ads Control Center"
                    subtitle="Create, edit, pause, duplicate campaigns. Spend / CTR / CPC."
                    phase="Phase 3"
                  />
                }
              />
              <Route
                path="distribution"
                element={
                  <PlaceholderPage
                    title="Distribution Control"
                    subtitle="Tunearo integration — releases, UPC/ISRC, delivery status."
                    phase="Phase 4"
                  />
                }
              />
              <Route
                path="links"
                element={
                  <PlaceholderPage
                    title="Link Control System"
                    subtitle="All smart & one-click links. Clicks, conversions, routing."
                    phase="Phase 4"
                  />
                }
              />
              <Route
                path="billing"
                element={
                  <PlaceholderPage
                    title="Billing + Credit Control"
                    subtitle="Grant / revoke credits, override subscriptions, comp accounts."
                    phase="Phase 2"
                  />
                }
              />
              <Route
                path="logs"
                element={
                  <PlaceholderPage
                    title="Errors & Logs"
                    subtitle="Netlify functions, API failures, auth issues."
                    phase="Phase 4"
                  />
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AdminGuard>
      </AdminAuthProvider>
    </BrowserRouter>
  );
}
