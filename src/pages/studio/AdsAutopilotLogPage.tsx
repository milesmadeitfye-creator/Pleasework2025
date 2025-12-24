import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

export default function AdsAutopilotLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    load();
  }, [limit]);

  async function load() {
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('ads_autopilot_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    setLogs(data ?? []);
    setLoading(false);
  }

  function getResultBadge(result: string) {
    const icons = {
      ok: <CheckCircle className="w-4 h-4 text-green-500" />,
      failed: <XCircle className="w-4 h-4 text-red-500" />,
      queued: <Clock className="w-4 h-4 text-yellow-500" />,
    };

    const colors = {
      ok: 'bg-green-500/20 text-green-500 border-green-500/30',
      failed: 'bg-red-500/20 text-red-500 border-red-500/30',
      queued: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
    };

    return (
      <span className={`px-2 py-1 rounded-lg border text-xs font-medium flex items-center gap-1 ${colors[result as keyof typeof colors] || colors.ok}`}>
        {icons[result as keyof typeof icons]}
        {result.toUpperCase()}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin opacity-50" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Autopilot Activity Log</h1>
        <p className="text-sm opacity-70 mt-2">
          Complete audit trail of all autopilot actions.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium">Show:</label>
        <select
          className="border rounded-xl px-3 py-2 bg-white/5"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        >
          <option value={25}>Last 25 actions</option>
          <option value={50}>Last 50 actions</option>
          <option value={100}>Last 100 actions</option>
          <option value={250}>Last 250 actions</option>
        </select>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-2xl border bg-white/5 p-12 text-center">
          <AlertCircle className="w-12 h-12 mx-auto opacity-30 mb-4" />
          <div className="font-medium opacity-80">No activity yet</div>
          <div className="text-sm opacity-60 mt-2">Autopilot actions will appear here.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="rounded-xl border bg-white/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="font-medium">
                      {log.action_taken.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </div>
                    {getResultBadge(log.result)}
                    <div className="text-xs opacity-60 px-2 py-1 rounded bg-white/5 border">
                      {log.entity_type}: {log.entity_id.slice(0, 16)}...
                    </div>
                  </div>

                  <div className="text-xs opacity-60">
                    {new Date(log.created_at).toLocaleString()}
                    {log.meta?.rule_name && ` • Rule: ${log.meta.rule_name}`}
                    {log.meta?.approved && ' • Human Approved'}
                  </div>
                </div>

                <details className="text-right">
                  <summary className="cursor-pointer text-xs opacity-70 hover:opacity-100">
                    Details
                  </summary>
                  <div className="mt-2 text-left">
                    {log.before && (
                      <div className="mb-2">
                        <div className="text-xs font-medium opacity-70 mb-1">Before:</div>
                        <pre className="text-xs overflow-auto bg-black/20 p-2 rounded border max-w-md">
                          {JSON.stringify(log.before, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.after && (
                      <div className="mb-2">
                        <div className="text-xs font-medium opacity-70 mb-1">After:</div>
                        <pre className="text-xs overflow-auto bg-black/20 p-2 rounded border max-w-md">
                          {JSON.stringify(log.after, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.meta?.error && (
                      <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded border border-red-500/30">
                        Error: {log.meta.error}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
