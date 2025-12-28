import { useState } from 'react';
import { supabase } from '@/lib/supabase.client';
import { RefreshCw, Copy, CheckCircle } from 'lucide-react';

interface SessionInfo {
  hasSession: boolean;
  expiresAt: string | null;
}

interface UserInfo {
  userId: string | null;
  email: string | null;
}

interface RpcInfo {
  data: any;
  error: any;
}

export function MetaDebugPanel() {
  const [loading, setLoading] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [rpcInfo, setRpcInfo] = useState<RpcInfo | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runChecks = async () => {
    setLoading(true);
    const now = new Date().toISOString();

    try {
      // Check session
      const { data: sessionData } = await supabase.auth.getSession();
      const session: SessionInfo = {
        hasSession: !!sessionData.session,
        expiresAt: sessionData.session?.expires_at ?? null,
      };
      setSessionInfo(session);

      // Check user
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const user: UserInfo = {
        userId: userData.user?.id ?? null,
        email: userData.user?.email ?? null,
      };
      setUserInfo(user);

      // Check Meta connection via RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_meta_connection_status');
      setRpcInfo({
        data: rpcData ?? null,
        error: rpcError ?? null,
      });

      setLastRunAt(now);
    } catch (err) {
      console.error('[MetaDebugPanel] Error running checks:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyDebugInfo = () => {
    const debugInfo = {
      timestamp: lastRunAt,
      session: sessionInfo,
      user: userInfo,
      rpc: rpcInfo,
    };

    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasData = sessionInfo !== null || userInfo !== null || rpcInfo !== null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={runChecks}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Running checks...' : hasData ? 'Re-run checks' : 'Run checks'}
        </button>

        {hasData && (
          <button
            onClick={copyDebugInfo}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
          >
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy debug
              </>
            )}
          </button>
        )}
      </div>

      {hasData && (
        <div className="space-y-3 text-xs">
          {lastRunAt && (
            <div className="text-gray-400">
              Last run: {new Date(lastRunAt).toLocaleString()}
            </div>
          )}

          {/* Session Info */}
          {sessionInfo && (
            <div className="bg-slate-800/50 rounded-lg p-3">
              <h4 className="font-semibold text-white mb-2">Auth Session</h4>
              <div className="space-y-1 text-gray-300">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Has session:</span>
                  <span className={sessionInfo.hasSession ? 'text-green-400' : 'text-red-400'}>
                    {sessionInfo.hasSession ? 'Yes' : 'No'}
                  </span>
                </div>
                {sessionInfo.expiresAt && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Expires at:</span>
                    <span>{new Date(sessionInfo.expiresAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* User Info */}
          {userInfo && (
            <div className="bg-slate-800/50 rounded-lg p-3">
              <h4 className="font-semibold text-white mb-2">User Info</h4>
              <div className="space-y-1 text-gray-300">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">User ID:</span>
                  <span className="font-mono text-xs">
                    {userInfo.userId ? userInfo.userId.slice(0, 8) + '...' : 'null'}
                  </span>
                </div>
                {userInfo.email && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Email:</span>
                    <span>{userInfo.email}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RPC Info */}
          {rpcInfo && (
            <div className="bg-slate-800/50 rounded-lg p-3">
              <h4 className="font-semibold text-white mb-2">Meta Connection RPC</h4>

              {rpcInfo.error ? (
                <div className="space-y-1">
                  <div className="text-red-400 font-semibold">Error</div>
                  <pre className="bg-slate-900 p-2 rounded text-red-300 overflow-x-auto">
                    {JSON.stringify(rpcInfo.error, null, 2)}
                  </pre>
                </div>
              ) : rpcInfo.data ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Connected:</span>
                    <span className={rpcInfo.data.is_connected ? 'text-green-400' : 'text-yellow-400'}>
                      {rpcInfo.data.is_connected ? 'Yes' : 'No'}
                    </span>
                  </div>

                  {rpcInfo.data.is_connected && (
                    <>
                      {rpcInfo.data.ad_account_id && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">Ad Account:</span>
                          <span>{rpcInfo.data.ad_account_name || rpcInfo.data.ad_account_id}</span>
                        </div>
                      )}
                      {rpcInfo.data.page_id && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">Page:</span>
                          <span>{rpcInfo.data.page_name || rpcInfo.data.page_id}</span>
                        </div>
                      )}
                      {rpcInfo.data.instagram_account_count !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">Instagram:</span>
                          <span>{rpcInfo.data.instagram_account_count} account(s)</span>
                        </div>
                      )}
                      {rpcInfo.data.pixel_id && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">Pixel:</span>
                          <span>{rpcInfo.data.pixel_id}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">Token valid:</span>
                        <span className={rpcInfo.data.has_valid_token ? 'text-green-400' : 'text-yellow-400'}>
                          {rpcInfo.data.has_valid_token ? 'Yes' : 'No / Expired'}
                        </span>
                      </div>
                    </>
                  )}

                  <details className="mt-2">
                    <summary className="cursor-pointer text-gray-400 hover:text-white">
                      Show full RPC response
                    </summary>
                    <pre className="bg-slate-900 p-2 rounded text-gray-300 overflow-x-auto mt-2 text-[10px]">
                      {JSON.stringify(rpcInfo.data, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                <div className="text-gray-400">No data</div>
              )}
            </div>
          )}
        </div>
      )}

      {!hasData && (
        <div className="text-sm text-gray-400 text-center py-4">
          Click "Run checks" to see Meta connection debug info
        </div>
      )}
    </div>
  );
}
