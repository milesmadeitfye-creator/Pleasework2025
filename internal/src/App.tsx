import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from '@/contexts/AdminAuthContext';
import AdminGuard from '@/components/AdminGuard';
import Shell from '@/components/Shell';

const OverviewPage = lazy(() => import('@/pages/OverviewPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));
const AIMonitorPage = lazy(() => import('@/pages/AIMonitorPage'));
const BillingPage = lazy(() => import('@/pages/BillingPage'));
const CreativesPage = lazy(() => import('@/pages/CreativesPage'));
const AdsPage = lazy(() => import('@/pages/AdsPage'));
const DistributionPage = lazy(() => import('@/pages/DistributionPage'));
const LinksPage = lazy(() => import('@/pages/LinksPage'));
const LogsPage = lazy(() => import('@/pages/LogsPage'));
const ImprovementsPage = lazy(() => import('@/pages/ImprovementsPage'));
const PlatformStatsPage = lazy(() => import('@/pages/PlatformStatsPage'));
const TeamPage = lazy(() => import('@/pages/TeamPage'));
const AdsEnginePage = lazy(() => import('@/pages/AdsEnginePage'));

function RouteLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand-600" />
    </div>
  );
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteLoading />}>{children}</Suspense>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <AdminGuard>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Lazy><OverviewPage /></Lazy>} />
              <Route path="users" element={<Lazy><UsersPage /></Lazy>} />
              <Route path="ai" element={<Lazy><AIMonitorPage /></Lazy>} />
              <Route path="billing" element={<Lazy><BillingPage /></Lazy>} />
              <Route path="creatives" element={<Lazy><CreativesPage /></Lazy>} />
              <Route path="ads" element={<Lazy><AdsPage /></Lazy>} />
              <Route path="distribution" element={<Lazy><DistributionPage /></Lazy>} />
              <Route path="links" element={<Lazy><LinksPage /></Lazy>} />
              <Route path="logs" element={<Lazy><LogsPage /></Lazy>} />
              <Route path="improvements" element={<Lazy><ImprovementsPage /></Lazy>} />
              <Route path="platforms" element={<Lazy><PlatformStatsPage /></Lazy>} />
              <Route path="team" element={<Lazy><TeamPage /></Lazy>} />
              <Route path="ads-engine" element={<Lazy><AdsEnginePage /></Lazy>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AdminGuard>
      </AdminAuthProvider>
    </BrowserRouter>
  );
}
