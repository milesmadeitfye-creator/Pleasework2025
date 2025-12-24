import { useState } from 'react';
import { Activity, CheckCircle, XCircle } from 'lucide-react';

export default function HealthzDebug() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const checkHealthz = async () => {
    setChecking(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch(`/.netlify/functions/healthz?t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.7)]">
      <div className="flex items-center gap-3 mb-4">
        <Activity className="w-5 h-5 text-blue-400" />
        <h3 className="text-lg font-semibold text-slate-50">Deploy Truth Checker</h3>
      </div>

      <p className="text-sm text-slate-400 mb-4">
        Verify that Netlify functions are deployed and live. Click below to check the current deploy ID.
      </p>

      <button
        type="button"
        onClick={checkHealthz}
        disabled={checking}
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold border transition-all ${
          checking
            ? 'opacity-60 cursor-not-allowed border-slate-700 bg-slate-900 text-slate-400'
            : 'border-blue-500/50 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
        }`}
      >
        {checking ? 'Checking...' : 'Check Healthz'}
      </button>

      {result && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-4 h-4 text-emerald-300" />
            <span className="text-sm font-semibold text-emerald-300">Functions Live</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-slate-400">Deploy ID:</span>
              <span className="text-sm font-mono font-semibold text-emerald-200">
                {result.deploy_id}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-slate-400">Timestamp:</span>
              <span className="text-xs font-mono text-slate-300">{result.timestamp}</span>
            </div>
            {result.headers?.['x-nf-request-id'] && (
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-slate-400">Request ID:</span>
                <span className="text-xs font-mono text-slate-300">
                  {result.headers['x-nf-request-id']}
                </span>
              </div>
            )}
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-300 font-semibold">
              Full JSON
            </summary>
            <pre className="mt-2 p-3 rounded-lg bg-slate-900/80 text-slate-300 text-[10px] overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-red-300" />
            <span className="text-sm font-semibold text-red-300">Check Failed</span>
          </div>
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}
    </div>
  );
}
