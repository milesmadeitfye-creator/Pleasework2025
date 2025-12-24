import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { TopNav } from './TopNav';
import { ProNudgeModal } from '../global/ProNudgeModal';
import { getBuildStamp } from '../../buildInfo';
import { writeRoute } from '../../debug/routeLog';

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const buildStamp = getBuildStamp();
  const location = useLocation();

  useEffect(() => {
    writeRoute("app_mounted");
  }, []);

  useEffect(() => {
    writeRoute("route_changed");
  }, [location.pathname, location.search, location.hash]);

  return (
    <div className="min-h-screen bg-ghoste-navy text-ghoste-white">
      <TopNav />

      <main className="flex-1 safe-top">
        {children}
      </main>

      <ProNudgeModal />

      {/* Build info stamp - bottom right corner */}
      <div className="fixed bottom-2 right-2 text-[10px] text-ghoste-gray/40 font-mono pointer-events-none select-none z-[9999]">
        {buildStamp}
      </div>
    </div>
  );
}
