import { useEffect, useState } from 'react';
import { X, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAdsDebugLastRun, clearAdsDebugLastRun, type AdsDebugRun } from '../../utils/adsDebugBus';

interface MetaConnectionStatus {
  auth_connected: boolean;
  assets_configured: boolean;
  ad_account_id?: string;
  page_id?: string;
  pixel_id?: string;
  instagram_actor_id?: string;
}

interface AdsDebugPanelProps {
  onClose: () => void;
}

export function AdsDebugPanel({ onClose }: AdsDebugPanelProps) {
  const [metaStatus, setMetaStatus] = useState<MetaConnectionStatus | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<AdsDebugRun | null>(null);
  const [activeTab, setActiveTab] = useState<'meta' | 'lastRun'>('meta');

  const loadMetaStatus = async () => {
    setMetaLoading(true);
    setMetaError(null);
    try {
      const { data, error } = await supabase.rpc('get_meta_connection_status');
      if (error) throw error;
      setMetaStatus(data as MetaConnectionStatus);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'Failed to load Meta status');
    } finally {
      setMetaLoading(false);
    }
  };

  const loadLastRun = () => {
    const run = getAdsDebugLastRun();
    setLastRun(run);
  };

  const handleClearLastRun = () => {
    clearAdsDebugLastRun();
    setLastRun(null);
  };

  useEffect(() => {
    loadMetaStatus();
    loadLastRun();

    // Poll for last run updates every 2s
    const interval = setInterval(loadLastRun, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 w-[min(560px,92vw)] max-h-[45vh] bg-[#0A0F29] border border-white/10 rounded-xl shadow-2xl z-[100] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white">Ads Debug Panel</h3>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          title="Close debug panel"
        >
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-3 pt-2 border-b border-white/10">
        <button
          onClick={() => setActiveTab('meta')}
          className={[
            'px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors',
            activeTab === 'meta'
              ? 'bg-white/10 text-white border-b-2 border-[#1A6CFF]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          ].join(' ')}
        >
          Meta Status
        </button>
        <button
          onClick={() => setActiveTab('lastRun')}
          className={[
            'px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors',
            activeTab === 'lastRun'
              ? 'bg-white/10 text-white border-b-2 border-[#1A6CFF]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          ].join(' ')}
        >
          Last Submit
          {lastRun && <span className="ml-1.5 px-1.5 py-0.5 bg-green-500/20 text-green-300 text-[10px] rounded">NEW</span>}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 ghoste-studio-scrollbars">
        {activeTab === 'meta' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Meta Connection Status</span>
              <button
                onClick={loadMetaStatus}
                disabled={metaLoading}
                className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-white/60 ${metaLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {metaError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                <p className="text-xs text-red-300">{metaError}</p>
              </div>
            )}

            {metaStatus && (
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1.5 px-2 bg-white/5 rounded">
                  <span className="text-xs text-white/70">Auth Connected</span>
                  <span className={`text-xs font-medium ${metaStatus.auth_connected ? 'text-green-400' : 'text-red-400'}`}>
                    {metaStatus.auth_connected ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 px-2 bg-white/5 rounded">
                  <span className="text-xs text-white/70">Assets Configured</span>
                  <span className={`text-xs font-medium ${metaStatus.assets_configured ? 'text-green-400' : 'text-red-400'}`}>
                    {metaStatus.assets_configured ? 'Yes' : 'No'}
                  </span>
                </div>

                {metaStatus.ad_account_id && (
                  <div className="py-1.5 px-2 bg-white/5 rounded">
                    <span className="text-xs text-white/50 block">Ad Account ID</span>
                    <span className="text-xs text-white/90 font-mono">{metaStatus.ad_account_id}</span>
                  </div>
                )}

                {metaStatus.page_id && (
                  <div className="py-1.5 px-2 bg-white/5 rounded">
                    <span className="text-xs text-white/50 block">Page ID</span>
                    <span className="text-xs text-white/90 font-mono">{metaStatus.page_id}</span>
                  </div>
                )}

                {metaStatus.pixel_id && (
                  <div className="py-1.5 px-2 bg-white/5 rounded">
                    <span className="text-xs text-white/50 block">Pixel ID</span>
                    <span className="text-xs text-white/90 font-mono">{metaStatus.pixel_id}</span>
                  </div>
                )}

                {metaStatus.instagram_actor_id && (
                  <div className="py-1.5 px-2 bg-white/5 rounded">
                    <span className="text-xs text-white/50 block">Instagram Actor ID</span>
                    <span className="text-xs text-white/90 font-mono">{metaStatus.instagram_actor_id}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'lastRun' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Last Ads Operation</span>
              {lastRun && (
                <button
                  onClick={handleClearLastRun}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                  title="Clear last run"
                >
                  <Trash2 className="w-3.5 h-3.5 text-white/60" />
                </button>
              )}
            </div>

            {!lastRun && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <p className="text-xs text-white/60 text-center">No ads operations recorded yet</p>
              </div>
            )}

            {lastRun && (
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1.5 px-2 bg-white/5 rounded">
                  <span className="text-xs text-white/70">Label</span>
                  <span className="text-xs font-medium text-white/90">{lastRun.label}</span>
                </div>

                <div className="flex items-center justify-between py-1.5 px-2 bg-white/5 rounded">
                  <span className="text-xs text-white/70">Status</span>
                  <span className={`text-xs font-medium ${lastRun.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {lastRun.status} {lastRun.ok ? 'OK' : 'ERROR'}
                  </span>
                </div>

                <div className="py-1.5 px-2 bg-white/5 rounded">
                  <span className="text-xs text-white/50 block mb-1">Timestamp</span>
                  <span className="text-xs text-white/90 font-mono">
                    {new Date(lastRun.at).toLocaleString()}
                  </span>
                </div>

                <div className="py-1.5 px-2 bg-white/5 rounded">
                  <span className="text-xs text-white/50 block mb-1">Request</span>
                  <pre className="text-[10px] text-white/80 font-mono overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto ghoste-studio-scrollbars">
                    {JSON.stringify(lastRun.request, null, 2)}
                  </pre>
                </div>

                <div className="py-1.5 px-2 bg-white/5 rounded">
                  <span className="text-xs text-white/50 block mb-1">Response</span>
                  <pre className="text-[10px] text-white/80 font-mono overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto ghoste-studio-scrollbars">
                    {JSON.stringify(lastRun.response, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
