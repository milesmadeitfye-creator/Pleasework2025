import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  AlertCircle,
  Shield,
  Play,
} from 'lucide-react';

type LogSeverity = 'error' | 'warning' | 'info';
type LogType = 'error' | 'warning' | 'info' | 'security';

interface LogEntry {
  id: string;
  timestamp: string;
  type: LogType;
  severity: LogSeverity;
  message: string;
  actor: string | null;
}

interface SecurityFinding {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  timestamp: string;
}

interface LogsData {
  ok: true;
  logs: LogEntry[];
  securityFindings: SecurityFinding[];
  lastSecuritySweep: string;
}

export default function LogsPage() {
  const [data, setData] = useState<LogsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'errors' | 'security'>('all');
  const [sweeping, setSweeping] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api<LogsData>('/.netlify/functions/admin-logs');
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 60_000);
    return () => clearInterval(t);
  }, []);

  const handleSecuritySweep = async () => {
    try {
      setSweeping(true);
      await api('/.netlify/functions/admin-logs', {
        method: 'POST',
        body: JSON.stringify({ action: 'run-security-sweep' }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Security sweep failed.');
    } finally {
      setSweeping(false);
    }
  };

  const filteredLogs = data?.logs.filter((log) => {
    if (tab === 'all') return true;
    if (tab === 'errors') return log.type === 'error';
    if (tab === 'security') return log.type === 'security';
    return true;
  }) || [];

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="rounded-lg border border-line bg-ink-1 p-6 text-center text-sm text-fg-mute">
          Loading logs...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Errors & Logs</h1>
        <p className="text-xs text-fg-mute">
          System logs, errors, and security sweep results.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-line bg-ink-1 p-4 text-sm text-err flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {data && (
        <>
          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">Logs</h2>
              </div>
              <div className="flex gap-2">
                {['all', 'errors', 'security'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t as typeof tab)}
                    className={`text-xs px-3 py-1 rounded border transition-colors ${
                      tab === t
                        ? 'border-brand-600 bg-brand-600/10 text-brand-500'
                        : 'border-line/50 text-fg-mute hover:text-fg'
                    }`}
                  >
                    {t === 'all' ? 'All Logs' : t === 'errors' ? 'Errors' : 'Security'}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Time</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Type</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Severity</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Message</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length > 0 ? (
                    filteredLogs.slice(0, 50).map((log) => (
                      <tr key={log.id} className="border-b border-line/50 hover:bg-ink-2/50">
                        <td className="py-2 px-3 text-xs text-fg-mute whitespace-nowrap">
                          {relTime(log.timestamp)}
                        </td>
                        <td className="py-2 px-3 text-xs text-fg-soft capitalize">{log.type}</td>
                        <td className="py-2 px-3">
                          <span className={`text-xs font-medium px-2 py-1 rounded inline-flex items-center gap-1 ${
                            log.severity === 'error' ? 'text-err bg-err/10' :
                            log.severity === 'warning' ? 'text-warn bg-warn/10' :
                            'text-fg-soft bg-fg-soft/10'
                          }`}>
                            {log.severity === 'error' && <AlertTriangle className="h-3 w-3" />}
                            {log.severity === 'warning' && <AlertCircle className="h-3 w-3" />}
                            {log.severity.charAt(0).toUpperCase() + log.severity.slice(1)}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-fg-soft truncate max-w-md">{log.message}</td>
                        <td className="py-2 px-3 font-mono text-xs text-fg-mute">
                          {log.actor ? log.actor.slice(0, 12) + '...' : '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-fg-mute">
                        No logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">Security Sweep</h2>
                <p className="text-xs text-fg-mute mt-1">
                  Last sweep: {data.lastSecuritySweep
                    ? relTime(data.lastSecuritySweep)
                    : 'Never'}
                </p>
              </div>
              <button
                onClick={handleSecuritySweep}
                disabled={sweeping}
                className="btn btn-primary text-sm inline-flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                {sweeping ? 'Running...' : 'Run Sweep'}
              </button>
            </div>

            {data.securityFindings.length > 0 ? (
              <div className="space-y-3 mt-4">
                {data.securityFindings.map((finding) => (
                  <div key={finding.id} className="p-3 bg-ink-2 rounded border border-line/50">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-start gap-2 flex-1">
                        <Shield className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                          finding.severity === 'high' ? 'text-err' :
                          finding.severity === 'medium' ? 'text-warn' :
                          'text-fg-soft'
                        }`} />
                        <div className="min-w-0">
                          <p className="font-medium text-fg">{finding.title}</p>
                          <p className="text-xs text-fg-soft mt-1">{finding.description}</p>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded whitespace-nowrap ${
                        finding.severity === 'high' ? 'text-err bg-err/10' :
                        finding.severity === 'medium' ? 'text-warn bg-warn/10' :
                        'text-fg-soft bg-fg-soft/10'
                      }`}>
                        {finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)}
                      </span>
                    </div>
                    <p className="text-xs text-fg-mute">
                      Found {relTime(finding.timestamp)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-fg-soft">
                No security findings detected.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
