import { useState } from 'react';
import { Bug } from 'lucide-react';
import { PageShell } from '../../components/layout/PageShell';
import { StudioTabs } from '../../components/studio/StudioTabs';
import { EmailConfirmGate } from '../../components/EmailConfirmGate';
import AdsManager from '../../components/AdsManager';
import { AdsDebugPanel } from '../../components/ads/AdsDebugPanel';

const DEBUG_PANEL_STORAGE_KEY = 'ghoste_debug_ads_panel';

export default function AdCampaignsPage() {
  const [debugOpen, setDebugOpen] = useState(() => {
    return localStorage.getItem(DEBUG_PANEL_STORAGE_KEY) === '1';
  });

  const toggleDebug = () => {
    setDebugOpen((prev) => {
      const next = !prev;
      localStorage.setItem(DEBUG_PANEL_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  };

  return (
    <PageShell title="Ghoste Studio" fullWidth>
      <div className="max-w-7xl mx-auto">
        <StudioTabs />
        <EmailConfirmGate>
          <AdsManager />
        </EmailConfirmGate>
      </div>

      {/* Floating Debug Button - hide when panel is open */}
      {!debugOpen && (
        <button
          onClick={toggleDebug}
          className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2.5 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-300 text-xs font-semibold rounded-lg shadow-lg transition-all z-50"
          title="Toggle Ads Debug Panel"
        >
          <Bug className="w-4 h-4" />
          Ads Debug
        </button>
      )}

      {/* Debug Panel */}
      {debugOpen && (
        <AdsDebugPanel
          onClose={() => {
            setDebugOpen(false);
            localStorage.setItem(DEBUG_PANEL_STORAGE_KEY, '0');
          }}
        />
      )}
    </PageShell>
  );
}
