import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Plus,
  X,
  Zap,
  Clock,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

type Priority = 'low' | 'medium' | 'high' | 'critical';

interface Improvement {
  id: string;
  actor_email: string;
  action: string;
  target_email: string | null;
  payload: {
    name: string;
    description: string;
    priority: Priority;
  };
  created_at: string;
}

interface ImprovementsResponse {
  status: string;
  action: string;
  data: {
    improvements: Improvement[];
    count: number;
  };
}

export default function ImprovementsPage() {
  const [data, setData] = useState<ImprovementsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState<Priority | 'all'>('all');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    priority: 'medium' as Priority,
  });
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api<ImprovementsResponse>(
        '/.netlify/functions/admin-ai-agent',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'list-improvements' }),
        }
      );
      setData(res);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load improvements.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.description.trim()) {
      setError('Name and description are required.');
      return;
    }

    try {
      setSubmitting(true);
      await api('/.netlify/functions/admin-ai-agent', {
        method: 'POST',
        body: JSON.stringify({
          action: 'queue-improvement',
          payload: {
            name: formData.name,
            description: formData.description,
            priority: formData.priority,
          },
        }),
      });
      setFormData({ name: '', description: '', priority: 'medium' });
      setShowModal(false);
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to queue improvement.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filteredImprovements = (data?.data?.improvements ?? []).filter((imp) => {
    if (filter === 'all') return true;
    return imp?.payload?.priority === filter;
  });

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="rounded-lg border border-line bg-ink-1 p-6 text-center text-sm text-fg-mute">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading improvements...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Queued System Improvements
          </h1>
          <p className="text-xs text-fg-mute">
            Ideas for system enhancements and optimizations.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn btn-primary text-sm inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Queue New
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
            <h2 className="text-sm font-semibold mb-4">Filter by Priority</h2>
            <div className="flex gap-2 flex-wrap">
              {['all', 'low', 'medium', 'high', 'critical'].map((p) => (
                <button
                  key={p}
                  onClick={() => setFilter(p as Priority | 'all')}
                  className={`text-xs px-3 py-1 rounded border transition-colors ${
                    filter === p
                      ? 'border-brand-600 bg-brand-600/10 text-brand-500'
                      : 'border-line/50 text-fg-mute hover:text-fg'
                  }`}
                >
                  {p === 'all'
                    ? 'All Priorities'
                    : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            {(filteredImprovements?.length ?? 0) > 0 ? (
              filteredImprovements.map((improvement) => (
                <div
                  key={improvement?.id}
                  className="rounded-lg border border-line bg-ink-1 p-4 hover:bg-ink-1/80 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-fg">
                          {improvement?.payload?.name ?? '—'}
                        </h3>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap ${
                            improvement?.payload?.priority === 'critical'
                              ? 'text-err bg-err/10'
                              : improvement?.payload?.priority ===
                                  'high'
                                ? 'text-warn bg-warn/10'
                                : improvement?.payload?.priority ===
                                    'medium'
                                  ? 'text-fg-soft bg-fg-soft/10'
                                  : 'text-fg-mute bg-fg-mute/10'
                          }`}
                        >
                          {(
                            improvement?.payload?.priority ?? 'unknown'
                          )
                            .charAt(0)
                            .toUpperCase() +
                            (
                              improvement?.payload?.priority ?? 'unknown'
                            ).slice(1)}
                        </span>
                      </div>
                      <p className="text-sm text-fg-soft mb-2">
                        {improvement?.payload?.description ?? '—'}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-fg-mute">
                        <span>
                          by: {improvement?.actor_email ?? '—'}
                        </span>
                        <span>
                          {relTime(improvement?.created_at ?? '')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-line bg-ink-1 p-6 text-center text-sm text-fg-mute">
                No improvements queued.
              </div>
            )}
          </section>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-ink-2 rounded-lg border border-line p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Queue New Improvement</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-fg-mute hover:text-fg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-fg-mute uppercase tracking-wider mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Brief name for improvement"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-xs text-fg-mute uppercase tracking-wider mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      description: e.target.value,
                    })
                  }
                  placeholder="Detailed description of the improvement..."
                  className="input w-full h-24 p-3 text-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-fg-mute uppercase tracking-wider mb-2">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      priority: e.target.value as Priority,
                    })
                  }
                  className="input w-full"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="btn flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="btn btn-primary flex-1"
              >
                {submitting ? 'Submitting...' : 'Queue'}
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
