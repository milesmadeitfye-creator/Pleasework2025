import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Zap,
  CheckCircle2,
  Clock,
  Plus,
  X,
} from 'lucide-react';

interface AgentStatus {
  isActive: boolean;
  lastAction: string | null;
  tasksCompletedToday: number;
  lastActionTime: string | null;
}

interface AutonomousTask {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  completedAt: string | null;
}

interface AIAgentData {
  ok: true;
  agentStatus: AgentStatus;
  recentTasks: AutonomousTask[];
  recommendations: string[];
}

export default function AIMonitorPage() {
  const [data, setData] = useState<AIAgentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskDescription, setTaskDescription] = useState('');
  const [submittingTask, setSubmittingTask] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api<AIAgentData>('/.netlify/functions/admin-ai-agent', {
        method: 'POST',
        body: JSON.stringify({ action: 'status' }),
      });
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AI agent data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 30_000);
    return () => clearInterval(t);
  }, []);

  const handleRunTask = async () => {
    if (!taskDescription.trim()) return;
    try {
      setSubmittingTask(true);
      await api('/.netlify/functions/admin-ai-agent', {
        method: 'POST',
        body: JSON.stringify({
          action: 'queue-task',
          description: taskDescription,
        }),
      });
      setTaskDescription('');
      setShowTaskModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue task.');
    } finally {
      setSubmittingTask(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">AI Agent Monitor</h1>
          <p className="text-xs text-fg-mute">
            Claude auto-pilot dashboard, task queue, and recommendations.
          </p>
        </div>
        <button
          onClick={() => setShowTaskModal(true)}
          className="btn btn-primary text-sm inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Run Task
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-line bg-ink-1 p-4 text-sm text-err flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-line bg-ink-1 p-6 text-center text-sm text-fg-mute">
          Loading agent status...
        </div>
      )}

      {data && !loading && (
        <>
          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Agent Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Status</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${data.agentStatus.isActive ? 'bg-ok' : 'bg-fg-mute'}`} />
                  <span className="text-sm font-medium text-fg">
                    {data.agentStatus.isActive ? 'Active' : 'Idle'}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Tasks Completed (24h)</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-fg">
                  {data.agentStatus.tasksCompletedToday}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Last Action</p>
                <p className="mt-2 text-xs text-fg-soft truncate">
                  {data.agentStatus.lastAction
                    ? `${data.agentStatus.lastAction} (${relTime(data.agentStatus.lastActionTime || '')})`
                    : 'None'}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Autonomous Tasks</h2>
            <div className="space-y-3">
              {data.recentTasks.length > 0 ? (
                data.recentTasks.map((task) => (
                  <div key={task.id} className="flex items-start justify-between p-3 bg-ink-2 rounded border border-line/50">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-fg">{task.description}</p>
                      <p className="text-xs text-fg-mute mt-1">
                        Created {relTime(task.createdAt)}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded whitespace-nowrap ml-2 ${
                      task.status === 'completed' ? 'text-ok bg-ok/10' :
                      task.status === 'failed' ? 'text-err bg-err/10' :
                      task.status === 'running' ? 'text-warn bg-warn/10' :
                      'text-fg-soft bg-fg-soft/10'
                    }`}>
                      {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
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

          {data.recommendations.length > 0 && (
            <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <h2 className="text-sm font-semibold mb-4">AI Recommendations</h2>
              <div className="space-y-3">
                {data.recommendations.map((rec, idx) => (
                  <div key={idx} className="flex gap-3 p-3 bg-ink-2 rounded border border-line/50">
                    <Zap className="h-4 w-4 text-brand-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-fg-soft">{rec}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {showTaskModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-ink-2 rounded-lg border border-line p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Queue New Task</h3>
              <button
                onClick={() => setShowTaskModal(false)}
                className="text-fg-mute hover:text-fg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Describe the task for the AI agent..."
              className="input w-full h-24 p-3 text-sm resize-none"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowTaskModal(false)}
                className="btn flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleRunTask}
                disabled={submittingTask || !taskDescription.trim()}
                className="btn btn-primary flex-1"
              >
                {submittingTask ? 'Submitting...' : 'Submit Task'}
              </button>
            </div>
          </div>
        </div>
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
