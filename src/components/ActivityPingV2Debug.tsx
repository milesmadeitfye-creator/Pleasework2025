import { useState } from 'react';
import { Activity, CheckCircle, XCircle } from 'lucide-react';
import { sendActivityPingV2 } from '../lib/activityPingV2';

export default function ActivityPingV2Debug() {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const sendPingNow = async () => {
    setSending(true);
    setResult(null);
    setError(null);

    try {
      const response = await sendActivityPingV2({
        source: 'debug_button',
        path: window.location.pathname,
      });
      setResult(response);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.7)]">
      <div className="flex items-center gap-3 mb-4">
        <Activity className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-slate-50">Activity Ping v2 Debug</h3>
      </div>

      <p className="text-sm text-slate-400 mb-4">
        Test the new activity ping system. This writes a record to the database for verification.
      </p>

      <button
        type="button"
        onClick={sendPingNow}
        disabled={sending}
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold border transition-all ${
          sending
            ? 'opacity-60 cursor-not-allowed border-slate-700 bg-slate-900 text-slate-400'
            : 'border-purple-500/50 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20'
        }`}
      >
        {sending ? 'Sending...' : 'Send Ping v2 Now'}
      </button>

      {result && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-4 h-4 text-emerald-300" />
            <span className="text-sm font-semibold text-emerald-300">Ping Recorded</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-slate-400">Ping ID:</span>
              <span className="text-sm font-mono font-semibold text-emerald-200">
                {result.ping_id}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-slate-400">Created:</span>
              <span className="text-xs font-mono text-slate-300">
                {new Date(result.created_at).toLocaleString()}
              </span>
            </div>
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-300 font-semibold">
              Full JSON
            </summary>
            <pre className="mt-2 p-3 rounded-lg bg-slate-900/80 text-slate-300 text-[10px] overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>

          <div className="mt-3 p-3 bg-slate-900/60 rounded-lg border border-emerald-500/20">
            <p className="text-xs text-slate-300 font-semibold mb-1">Verify in Supabase:</p>
            <code className="text-[10px] text-emerald-300 block">
              SELECT * FROM user_activity_pings_v2 WHERE id = '{result.ping_id}';
            </code>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-red-300" />
            <span className="text-sm font-semibold text-red-300">Ping Failed</span>
          </div>
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}
    </div>
  );
}
