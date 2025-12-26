import { useState } from 'react';
import { Bug, X, Copy, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AIDebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIDebugPanel: React.FC<AIDebugPanelProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const fetchDebugData = async () => {
    setLoading(true);
    setError(null);
    setDebugData(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        setError('Not logged in - no session token available');
        setLoading(false);
        return;
      }

      const response = await fetch('/.netlify/functions/ai-debug-setup', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setError(data.error || `HTTP ${response.status}`);
        setDebugData(data);
      } else {
        setDebugData(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!debugData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(debugData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!isOpen) return null;

  const metaConnected = debugData?.setupStatus?.meta?.has_meta;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl bg-slate-900 rounded-xl border border-slate-700 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">AI Debug Setup</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!debugData && !loading && !error && (
            <div className="text-center py-8">
              <Bug className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 mb-4">
                Fetch your AI setup status to debug integration issues
              </p>
              <button
                onClick={fetchDebugData}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition"
              >
                Fetch Debug Data
              </button>
            </div>
          )}

          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-slate-400">Loading debug data...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-4">
              <p className="text-red-400 font-semibold mb-2">Error:</p>
              <p className="text-red-300 font-mono text-sm">{error}</p>
            </div>
          )}

          {debugData && (
            <div className="space-y-4">
              {/* Meta Status Badge */}
              {debugData.setupStatus && (
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <p className="text-sm text-slate-400 mb-2">Meta Connection</p>
                  <div className="flex items-center gap-2">
                    {metaConnected ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <span className="text-green-400 font-semibold">Connected</span>
                      </>
                    ) : (
                      <>
                        <X className="w-5 h-5 text-red-400" />
                        <span className="text-red-400 font-semibold">Not Connected</span>
                      </>
                    )}
                  </div>
                  {metaConnected && debugData.setupStatus.meta && (
                    <div className="mt-2 text-xs text-slate-400 font-mono">
                      <p>Ad Account: {debugData.setupStatus.meta.ad_account_id || 'N/A'}</p>
                      <p>Page: {debugData.setupStatus.meta.page_id || 'N/A'}</p>
                      <p>Pixel: {debugData.setupStatus.meta.pixel_id || 'N/A'}</p>
                    </div>
                  )}
                </div>
              )}

              {/* User ID */}
              {debugData.userId && (
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <p className="text-sm text-slate-400 mb-1">User ID</p>
                  <p className="text-white font-mono text-sm">{debugData.userId}</p>
                </div>
              )}

              {/* Full JSON */}
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-slate-400">Raw JSON Response</p>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-3 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition text-sm"
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-xs text-slate-300 overflow-x-auto bg-slate-900 p-3 rounded border border-slate-700 max-h-96 overflow-y-auto">
                  {JSON.stringify(debugData, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700 p-4 flex justify-between items-center">
          <p className="text-xs text-slate-500">
            Endpoint: /.netlify/functions/ai-debug-setup
          </p>
          {debugData && (
            <button
              onClick={fetchDebugData}
              className="px-3 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition text-sm"
            >
              Refresh
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
