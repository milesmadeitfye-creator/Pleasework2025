import { useEffect, useState } from 'react';
import { X, RefreshCw, Database, Terminal, Wifi, AlertTriangle, Copy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  startAdsDebugTap,
  stopAdsDebugTap,
  getAdsDebugBuffer,
  clearAdsDebugBuffer,
} from '../../utils/adsDebugTap';

interface MetaConnectionStatus {
  auth_connected: boolean;
  assets_configured: boolean;
  ad_account_id?: string;
  page_id?: string;
  pixel_id?: string;
  instagram_actor_id?: string;
}

interface AdsOperation {
  id: string;
  created_at: string;
  label: string;
  status: number;
  ok: boolean;
  meta_campaign_id?: string;
  meta_adset_id?: string;
  meta_ad_id?: string;
  error?: string;
  request?: any;
  response?: any;
}

interface ScanData {
  ok: boolean;
  now: string;
  operations: AdsOperation[];
  campaigns: any[];
  drafts: any[];
}

interface AdsDebugPanelProps {
  onClose: () => void;
}

export function AdsDebugPanel({ onClose }: AdsDebugPanelProps) {
  const [metaStatus, setMetaStatus] = useState<MetaConnectionStatus | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'meta' | 'operations' | 'data' | 'console' | 'network' | 'errors'>('operations');
  const [expandedOp, setExpandedOp] = useState<string | null>(null);
  const [captureEnabled, setCaptureEnabled] = useState(true);
  const [debugBuffer, setDebugBuffer] = useState(getAdsDebugBuffer());

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

  const loadScanData = async () => {
    setScanLoading(true);
    setScanError(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/.netlify/functions/ads-debug-scan', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to fetch scan data');
      }

      setScanData(data);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed to load scan data');
    } finally {
      setScanLoading(false);
    }
  };

  useEffect(() => {
    loadMetaStatus();
    loadScanData();

    // Start debug tap on mount
    if (captureEnabled) {
      startAdsDebugTap();
    }

    // Refresh buffer periodically
    const interval = setInterval(() => {
      setDebugBuffer(getAdsDebugBuffer());
    }, 1000);

    return () => {
      clearInterval(interval);
      // Optionally stop tap on unmount
      // stopAdsDebugTap();
    };
  }, []);

  useEffect(() => {
    if (captureEnabled) {
      startAdsDebugTap();
    } else {
      stopAdsDebugTap();
    }
  }, [captureEnabled]);

  const handleCopyAll = () => {
    const data = {
      timestamp: new Date().toISOString(),
      logs: debugBuffer.logs,
      network: debugBuffer.network,
      errors: debugBuffer.errors,
      scanData,
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    console.log('[AdsDebugPanel] Copied to clipboard');
  };

  const handleClearBuffers = () => {
    clearAdsDebugBuffer();
    setDebugBuffer(getAdsDebugBuffer());
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleString();
  };

  return (
    <div className="fixed bottom-4 right-4 w-[min(640px,92vw)] max-h-[50vh] bg-[#0A0F29] border border-white/10 rounded-xl shadow-2xl z-[100] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-white">Ads Debug Panel</h3>
          <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
            <input
              type="checkbox"
              checked={captureEnabled}
              onChange={(e) => setCaptureEnabled(e.target.checked)}
              className="w-3 h-3"
            />
            Capture Console
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyAll}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Copy all data to clipboard"
          >
            <Copy className="w-4 h-4 text-white/60" />
          </button>
          <button
            onClick={handleClearBuffers}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Clear buffers"
          >
            <RefreshCw className="w-4 h-4 text-white/60" />
          </button>
          <button
            onClick={loadScanData}
            disabled={scanLoading}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh scan data"
          >
            <RefreshCw className={`w-4 h-4 text-white/60 ${scanLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Close debug panel"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 pt-2 border-b border-white/10 overflow-x-auto">
        <button
          onClick={() => setActiveTab('operations')}
          className={[
            'px-2 py-1.5 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap',
            activeTab === 'operations'
              ? 'bg-white/10 text-white border-b-2 border-[#1A6CFF]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          ].join(' ')}
        >
          Operations ({scanData?.operations.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('console')}
          className={[
            'px-2 py-1.5 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-1',
            activeTab === 'console'
              ? 'bg-white/10 text-white border-b-2 border-[#1A6CFF]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          ].join(' ')}
        >
          <Terminal className="w-3 h-3" />
          Console ({debugBuffer.logs.length})
        </button>
        <button
          onClick={() => setActiveTab('network')}
          className={[
            'px-2 py-1.5 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-1',
            activeTab === 'network'
              ? 'bg-white/10 text-white border-b-2 border-[#1A6CFF]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          ].join(' ')}
        >
          <Wifi className="w-3 h-3" />
          Network ({debugBuffer.network.length})
        </button>
        <button
          onClick={() => setActiveTab('errors')}
          className={[
            'px-2 py-1.5 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-1',
            activeTab === 'errors'
              ? 'bg-white/10 text-white border-b-2 border-[#1A6CFF]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          ].join(' ')}
        >
          <AlertTriangle className="w-3 h-3" />
          Errors ({debugBuffer.errors.length})
        </button>
        <button
          onClick={() => setActiveTab('data')}
          className={[
            'px-2 py-1.5 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap',
            activeTab === 'data'
              ? 'bg-white/10 text-white border-b-2 border-[#1A6CFF]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          ].join(' ')}
        >
          Data
        </button>
        <button
          onClick={() => setActiveTab('meta')}
          className={[
            'px-2 py-1.5 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap',
            activeTab === 'meta'
              ? 'bg-white/10 text-white border-b-2 border-[#1A6CFF]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          ].join(' ')}
        >
          Meta Status
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 ghoste-studio-scrollbars">
        {/* Meta Tab */}
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

        {/* Operations Tab */}
        {activeTab === 'operations' && (
          <div className="space-y-3">
            {scanError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                <p className="text-xs text-red-300">{scanError}</p>
              </div>
            )}

            {!scanData?.operations.length && !scanLoading && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <p className="text-xs text-white/60 text-center">No operations recorded yet</p>
              </div>
            )}

            {scanData?.operations.map((op) => (
              <div key={op.id} className="bg-white/5 rounded-lg border border-white/10">
                <button
                  onClick={() => setExpandedOp(expandedOp === op.id ? null : op.id)}
                  className="w-full p-2 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-white">{op.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/50">{formatTimestamp(op.created_at)}</span>
                      <span className={`text-xs font-medium ${op.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {op.status}
                      </span>
                    </div>
                  </div>
                  {op.meta_campaign_id && (
                    <div className="text-[10px] text-white/60 font-mono">
                      Campaign: {op.meta_campaign_id}
                    </div>
                  )}
                  {op.error && (
                    <div className="text-[10px] text-red-300 mt-1">
                      Error: {op.error}
                    </div>
                  )}
                </button>

                {expandedOp === op.id && (
                  <div className="px-2 pb-2 space-y-2 border-t border-white/10 pt-2">
                    {op.request && (
                      <div>
                        <div className="text-[10px] text-white/50 mb-1">Request:</div>
                        <pre className="text-[9px] text-white/80 font-mono overflow-x-auto whitespace-pre-wrap max-h-24 overflow-y-auto ghoste-studio-scrollbars bg-black/20 p-1.5 rounded">
                          {JSON.stringify(op.request, null, 2)}
                        </pre>
                      </div>
                    )}
                    {op.response && (
                      <div>
                        <div className="text-[10px] text-white/50 mb-1">Response:</div>
                        <pre className="text-[9px] text-white/80 font-mono overflow-x-auto whitespace-pre-wrap max-h-24 overflow-y-auto ghoste-studio-scrollbars bg-black/20 p-1.5 rounded">
                          {JSON.stringify(op.response, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Console Tab */}
        {activeTab === 'console' && (
          <div className="space-y-1">
            {debugBuffer.logs.length === 0 && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <p className="text-xs text-white/60 text-center">No console logs captured yet</p>
              </div>
            )}

            {[...debugBuffer.logs].reverse().map((log, idx) => (
              <div
                key={idx}
                className={[
                  'p-2 rounded border',
                  log.level === 'error' ? 'bg-red-500/10 border-red-500/20' :
                  log.level === 'warn' ? 'bg-yellow-500/10 border-yellow-500/20' :
                  'bg-white/5 border-white/10'
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className={[
                    'text-[9px] font-medium uppercase',
                    log.level === 'error' ? 'text-red-400' :
                    log.level === 'warn' ? 'text-yellow-400' :
                    log.level === 'info' ? 'text-blue-400' :
                    'text-white/60'
                  ].join(' ')}>
                    {log.level}
                  </span>
                  <span className="text-[9px] text-white/50">
                    {new Date(log.ts).toLocaleTimeString()}
                  </span>
                </div>
                <pre className="text-[10px] text-white/80 font-mono whitespace-pre-wrap overflow-x-auto">
                  {log.args.map(arg =>
                    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                  ).join(' ')}
                </pre>
              </div>
            ))}
          </div>
        )}

        {/* Network Tab */}
        {activeTab === 'network' && (
          <div className="space-y-1">
            {debugBuffer.network.length === 0 && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <p className="text-xs text-white/60 text-center">No network requests captured yet</p>
              </div>
            )}

            {[...debugBuffer.network].reverse().map((req, idx) => (
              <div
                key={idx}
                className={[
                  'p-2 rounded border',
                  req.ok === false || req.error ? 'bg-red-500/10 border-red-500/20' :
                  'bg-white/5 border-white/10'
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-medium text-blue-400">{req.method}</span>
                    {req.status && (
                      <span className={[
                        'text-[9px] font-medium',
                        req.ok ? 'text-green-400' : 'text-red-400'
                      ].join(' ')}>
                        {req.status}
                      </span>
                    )}
                    {req.durationMs && (
                      <span className="text-[9px] text-white/50">{req.durationMs}ms</span>
                    )}
                  </div>
                  <span className="text-[9px] text-white/50">
                    {new Date(req.ts).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-[10px] text-white/70 font-mono mb-1 break-all">
                  {req.url}
                </div>
                {req.error && (
                  <div className="text-[10px] text-red-300 mb-1">
                    Error: {req.error}
                  </div>
                )}
                {(req.requestBody || req.responseBody) && (
                  <details className="mt-1">
                    <summary className="text-[9px] text-white/50 cursor-pointer hover:text-white/70">
                      Details
                    </summary>
                    <div className="mt-1 space-y-1">
                      {req.requestBody && (
                        <div>
                          <div className="text-[9px] text-white/50">Request:</div>
                          <pre className="text-[9px] text-white/70 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto bg-black/20 p-1 rounded">
                            {typeof req.requestBody === 'object' ? JSON.stringify(req.requestBody, null, 2) : req.requestBody}
                          </pre>
                        </div>
                      )}
                      {req.responseBody && (
                        <div>
                          <div className="text-[9px] text-white/50">Response:</div>
                          <pre className="text-[9px] text-white/70 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto bg-black/20 p-1 rounded">
                            {typeof req.responseBody === 'object' ? JSON.stringify(req.responseBody, null, 2) : req.responseBody}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Errors Tab */}
        {activeTab === 'errors' && (
          <div className="space-y-1">
            {debugBuffer.errors.length === 0 && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <p className="text-xs text-white/60 text-center">No errors captured</p>
              </div>
            )}

            {[...debugBuffer.errors].reverse().map((error, idx) => (
              <div
                key={idx}
                className="p-2 rounded border bg-red-500/10 border-red-500/20"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-[9px] font-medium text-red-400 uppercase">
                    {error.type}
                  </span>
                  <span className="text-[9px] text-white/50">
                    {new Date(error.ts).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-[10px] text-red-300 mb-1">
                  {error.message}
                </div>
                {error.stack && (
                  <details className="mt-1">
                    <summary className="text-[9px] text-white/50 cursor-pointer hover:text-white/70">
                      Stack Trace
                    </summary>
                    <pre className="text-[9px] text-white/70 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto bg-black/20 p-1 rounded mt-1">
                      {error.stack}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Data Tab */}
        {activeTab === 'data' && (
          <div className="space-y-3">
            {scanData?.campaigns && scanData.campaigns.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Database className="w-3.5 h-3.5 text-white/60" />
                  <span className="text-xs font-medium text-white">Campaigns ({scanData.campaigns.length})</span>
                </div>
                <div className="space-y-1">
                  {scanData.campaigns.slice(0, 10).map((campaign: any) => (
                    <div key={campaign.id} className="py-1.5 px-2 bg-white/5 rounded text-[10px]">
                      <div className="flex justify-between items-center">
                        <span className="text-white/90">{campaign.name || campaign.id}</span>
                        <span className="text-white/50">{formatTimestamp(campaign.created_at)}</span>
                      </div>
                      {campaign.meta_campaign_id && (
                        <div className="text-white/60 font-mono">Meta: {campaign.meta_campaign_id}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {scanData?.drafts && scanData.drafts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Database className="w-3.5 h-3.5 text-white/60" />
                  <span className="text-xs font-medium text-white">Drafts ({scanData.drafts.length})</span>
                </div>
                <div className="space-y-1">
                  {scanData.drafts.slice(0, 10).map((draft: any) => (
                    <div key={draft.id} className="py-1.5 px-2 bg-white/5 rounded text-[10px]">
                      <div className="flex justify-between items-center">
                        <span className="text-white/90">{draft.name || draft.id}</span>
                        <span className="text-white/50">{formatTimestamp(draft.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!scanData?.campaigns?.length && !scanData?.drafts?.length) && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <p className="text-xs text-white/60 text-center">No campaigns or drafts found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
