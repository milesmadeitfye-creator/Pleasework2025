import { useState } from 'react';
import { supabase } from '@/lib/supabase.client';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';

export default function DatabaseDiagnostic() {
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<any>(null);

  const runDiagnostics = async () => {
    setChecking(true);
    const diagnostics: any = {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
      tables: {},
      auth: null,
    };

    try {
      const { data: authData } = await supabase.auth.getSession();
      diagnostics.auth = {
        isAuthenticated: !!authData.session,
        userId: authData.session?.user?.id || null,
      };
    } catch (error: any) {
      diagnostics.auth = { error: error.message };
    }

    const tablesToCheck = ['smart_links', 'meta_connections', 'user_profiles', 'oneclick_links'];

    for (const table of tablesToCheck) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('id')
          .limit(1);

        if (error) {
          diagnostics.tables[table] = {
            exists: false,
            error: error.message,
            code: error.code,
          };
        } else {
          diagnostics.tables[table] = {
            exists: true,
            canRead: true,
          };
        }
      } catch (error: any) {
        diagnostics.tables[table] = {
          exists: false,
          error: error.message,
        };
      }
    }

    setResults(diagnostics);
    setChecking(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={runDiagnostics}
        disabled={checking}
        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-lg transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
        {checking ? 'Checking...' : 'Database Check'}
      </button>

      {results && (
        <div className="mt-4 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-4 w-96 max-h-96 overflow-y-auto">
          <h3 className="text-lg font-bold text-white mb-3">Diagnostics Results</h3>

          <div className="space-y-3 text-sm">
            <div>
              <div className="font-semibold text-gray-300 mb-1">Supabase URL:</div>
              <div className="text-gray-400 font-mono text-xs break-all">{results.supabaseUrl}</div>
            </div>

            <div>
              <div className="font-semibold text-gray-300 mb-1">Anon Key:</div>
              <div className="flex items-center gap-2">
                {results.hasAnonKey ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-400">Present</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400">Missing</span>
                  </>
                )}
              </div>
            </div>

            <div>
              <div className="font-semibold text-gray-300 mb-1">Authentication:</div>
              {results.auth?.isAuthenticated ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">Logged in</span>
                  <span className="text-gray-500 text-xs">({results.auth.userId?.slice(0, 8)}...)</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <span className="text-yellow-400">Not logged in</span>
                </div>
              )}
            </div>

            <div>
              <div className="font-semibold text-gray-300 mb-2">Database Tables:</div>
              <div className="space-y-2">
                {Object.entries(results.tables).map(([table, status]: [string, any]) => (
                  <div key={table} className="pl-2">
                    <div className="flex items-center gap-2">
                      {status.exists ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-400" />
                          <span className="text-green-400">{table}</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-400" />
                          <span className="text-red-400">{table}</span>
                        </>
                      )}
                    </div>
                    {status.error && (
                      <div className="text-xs text-red-300 mt-1 pl-6">
                        {status.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {!results.tables.smart_links?.exists && (
              <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded">
                <div className="font-semibold text-red-400 mb-1">Action Required:</div>
                <div className="text-xs text-red-300">
                  The smart_links table doesn't exist. You need to:
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>Go to Supabase Dashboard</li>
                    <li>Open SQL Editor</li>
                    <li>Run CREATE_ALL_TABLES.sql</li>
                  </ol>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setResults(null)}
            className="mt-4 w-full py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
