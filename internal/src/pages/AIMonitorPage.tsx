import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Zap,
  CheckCircle2,
  Clock,
  Plus,
  X,
  Loader2,
} from 'lucide-react';

interface RecentTask {
  id: string;
  user_id: string;
  trigger_type: string;
  status: string;
  created_at: string;
}

interface AutonomousTaskStats {
  total: number;
  statusCounts: {
    completed: number;
    pending: number;
    running: number;
  };
  recentTasks: RecentTask[];
}

interface SystemHealth {
  timestamp: string;
  status: string;
}

interface AIAgentResponse {
  status: string;
  action: string;
  data: {
    autonomousTasksStats: AutonomousTaskStats;
    systemHealth: SystemHealth;
  };
}

export default function AIMonitorPage() {
  const [data, setData] = useState<AIAgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [submittingTask, setSubmittingTask] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api<AIAgentResponse>(
        '/.netlify/functions/admin-ai-agent',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'status' }),
        }
      );
      setData(res);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load AI agent data.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 30000);
    return () => clearInterval(t);
  }, []);

  const handleQueueImprovement = async () => {
    try {
      setSubmittingTask(true);
      await api('/.netlify/functions/admin-ai-agent', {
        method: 'POST',
        body: JSON.stringify({
          action: 'queue-improvement',
          payload: {
            name: 'System Improvement',
            description: 'Queued from monitoring dashboard',
            priority: 'medium',
          },
        }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue improvement.');
    } finally {
      setSubmittingTask(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="rounded-lg border border-line bg-ink-1 p-6 text-center text-sm text-fg-mute">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading agent status...
          </div>
        </div>
      </div>
    );
  }

  const stats = data?.data?.autonomousTasksStats;
  const health = data?.data?.systemHealth;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            AI Agent Monitor
          </h1>
          <p className="text-xs text-fg-mute">
            Autonomous task queue, system health, and improvements.
          </p>
        </div>
        <button
          onClick={handleQueueImprovement}
          disabled={submittingTask}
          className="btn btn-primary text-sm inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          {submittingTask ? 'Queueing...' : 'Queue Improvement'}
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-line bg-ink-1 p-4 text-sm text-err flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {data && (
        <>
          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Agent Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">
                  System Health
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      health?.status === 'operational'
                        ? 'bg-ok'
                        : 'bg-warn'
                    }`}
                  />
                  <span className="text-sm font-medium text-fg">
                    {(health?.status ?? 'unknown')
                      .charAt(0)
                      .toUpperCase() +
                      (health?.status ?? 'unknown').slice(1)}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">
                  Last Check
                </p>
                <p className="mt-2 text-xs text-fg-soft">
                  {health?.timestamp
                    ? relTime(health.timestamp)
                    : 'unknown'}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Task Statistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-ink-2 rounded border border-line/50">
                <p className="text-xs text-fg-mute uppercase tracking-wider">
                  Total Tasks
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-fg">
                  {(stats?.total ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-ink-2 rounded border border-line/50">
                <p className="text-xs text-fg-mute uppercase tracking-wider">
                  Completed
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-ok">
                  {(stats?.statusCounts?.completed ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-ink-2 rounded border border-line/50">
                <p className="text-xs text-fg-mute uppercase tracking-wider">
                  Running
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-warn">
                  {(stats?.statusCounts?.running ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-ink-2 rounded border border-line/50">
                <p className="text-xs text-fg-mute uppercase tracking-wider">
                  Pending
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-fg-soft">
                  {(stats?.statusCounts?.pending ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Recent Tasks</h2>
            <div className="space-y-3">
              {((stats?.recentTasks ?? []).length > 0) ? (
                (stats?.recentTasks ?? []).slice(0, 10).map((task) => (
                  <div
                    key={task?.id}
                    className="flex items-start justify-between p-3 bg-ink-2 rounded border border-line/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-fg font-mono">
                        {(task?.id ?? '').slice(0, 8)}...
                      </p>
                      <p className="text-xs text-fg-mute mt-1">
                        {task?.trigger_type ?? '—'} - Created{' '}
                        {relTime(task?.created_at ?? '')}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded whitespace-nowrap ml-2 ${
                        task?.status === 'completed'
                          ? 'text-ok bg-ok/10'
                          : task?.status === 'running'
                            ? 'text-warn bg-warn/10'
                            : 'text-fg-soft bg-fg-soft/10'
                      }`}
                    >
                      {(task?.status ?? 'unknown')
                        .charAt(0)
                        .toUpperCase() +
                        (task?.status ?? 'unknown').slice(1)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-fg-mute">
                  No tasks yet.
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function relTime(iso: string): string {
  if (!iso) return 'unknown';
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
