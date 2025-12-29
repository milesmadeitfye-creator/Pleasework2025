import { useState, useEffect } from 'react';
import { PageShell } from '../../components/layout/PageShell';
import {
  RefreshCw,
  Send,
  PlayCircle,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Filter,
  Search,
  Mail,
} from 'lucide-react';

interface EmailOutboxRow {
  id: number;
  user_id: string | null;
  to_email: string;
  template_key: string;
  status: string;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  attempts: number;
}

interface StatsData {
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  sent_last_24h: number;
}

interface AutomationEvent {
  id: number;
  user_id: string;
  event_key: string;
  payload: any;
  created_at: string;
}

export default function EmailAdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<StatsData>({
    queued: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    sent_last_24h: 0,
  });
  const [outbox, setOutbox] = useState<EmailOutboxRow[]>([]);
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [emailSearch, setEmailSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchStats = async () => {
    if (!adminKey) {
      showToast('Please enter admin key first', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/.netlify/functions/admin-email-stats?limit=200&includeEvents=true', {
        headers: {
          'X-Admin-Key': adminKey,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch stats');
      }

      setStats(data.stats);
      setOutbox(data.recent || []);
      setEvents(data.events || []);
      setLastRefreshed(data.lastRefreshed);
      showToast('Stats refreshed successfully');
    } catch (error: any) {
      console.error('[EmailAdmin] Fetch error:', error);
      showToast(error.message || 'Failed to fetch stats', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEnqueueAll = async () => {
    if (!adminKey) {
      showToast('Please enter admin key first', 'error');
      return;
    }

    if (!confirm('Enqueue welcome emails to all users without welcome_email_sent_at?')) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/.netlify/functions/email-enqueue-welcome', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey,
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to enqueue');
      }

      showToast(`Enqueued ${data.queued} emails (${data.skipped} skipped)`);
      await fetchStats();
    } catch (error: any) {
      showToast(error.message || 'Enqueue failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRunWorker = async (times: number = 1) => {
    if (!adminKey) {
      showToast('Please enter admin key first', 'error');
      return;
    }

    setLoading(true);
    let totalSent = 0;
    let totalFailed = 0;

    try {
      for (let i = 0; i < times; i++) {
        const res = await fetch('/.netlify/functions/email-worker?limit=50', {
          method: 'POST',
          headers: {
            'X-Admin-Key': adminKey,
          },
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Worker failed');
        }

        totalSent += data.sent || 0;
        totalFailed += data.failed || 0;

        if (data.processed === 0) {
          break;
        }
      }

      showToast(`Sent ${totalSent} emails (${totalFailed} failed)`);
      await fetchStats();
    } catch (error: any) {
      showToast(error.message || 'Worker failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRetryFailed = async () => {
    if (!adminKey) {
      showToast('Please enter admin key first', 'error');
      return;
    }

    if (!confirm('Retry all failed emails (max 50)?')) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/.netlify/functions/admin-email-retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey,
        },
        body: JSON.stringify({
          status: 'failed',
          limit: 50,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Retry failed');
      }

      showToast(`Retried ${data.retriedCount} emails`);
      await fetchStats();
    } catch (error: any) {
      showToast(error.message || 'Retry failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRetrySelected = async () => {
    if (!adminKey) {
      showToast('Please enter admin key first', 'error');
      return;
    }

    if (selectedIds.size === 0) {
      showToast('No rows selected', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/.netlify/functions/admin-email-retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey,
        },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Retry failed');
      }

      showToast(`Retried ${data.retriedCount} emails`);
      setSelectedIds(new Set());
      await fetchStats();
    } catch (error: any) {
      showToast(error.message || 'Retry failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredOutbox.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOutbox.map((row) => row.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const filteredOutbox = outbox.filter((row) => {
    if (statusFilter !== 'all' && row.status !== statusFilter) return false;
    if (templateFilter !== 'all' && row.template_key !== templateFilter) return false;
    if (emailSearch && !row.to_email.toLowerCase().includes(emailSearch.toLowerCase())) return false;
    return true;
  });

  const uniqueTemplates = Array.from(new Set(outbox.map((row) => row.template_key)));

  const getStatusBadge = (status: string) => {
    const styles = {
      queued: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      sending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      sent: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      failed: 'bg-red-500/10 text-red-400 border-red-500/20',
    };

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${styles[status as keyof typeof styles] || 'bg-gray-500/10 text-gray-400'}`}>
        {status}
      </span>
    );
  };

  return (
    <PageShell title="Email Admin">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${toast.type === 'success' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/20 border border-red-500/30 text-red-300'}`}>
            {toast.message}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ghoste-white">Email Admin</h1>
            <p className="text-sm text-ghoste-grey mt-1">
              Monitor and control all outbound email operations
            </p>
          </div>
          {lastRefreshed && (
            <div className="text-xs text-ghoste-grey">
              Last refreshed: {new Date(lastRefreshed).toLocaleString()}
            </div>
          )}
        </div>

        {/* Admin Key & Controls */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ghoste-grey mb-2">
                Admin Key
              </label>
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Enter ADMIN_TASK_KEY"
                className="w-full px-4 py-2 bg-ghoste-black/60 border border-white/10 rounded-lg text-sm text-ghoste-white placeholder-ghoste-grey/50 focus:outline-none focus:border-ghoste-blue/50"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={fetchStats}
                disabled={loading || !adminKey}
                className="inline-flex items-center gap-2 px-4 py-2 bg-ghoste-blue text-white text-sm font-medium rounded-lg hover:bg-ghoste-blue/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Refresh
              </button>

              <button
                onClick={handleEnqueueAll}
                disabled={loading || !adminKey}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/30 text-amber-300 text-sm font-medium rounded-lg hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mail className="w-4 h-4" />
                Enqueue Welcome to All
              </button>

              <button
                onClick={() => handleRunWorker(1)}
                disabled={loading || !adminKey}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm font-medium rounded-lg hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                Run Worker (50)
              </button>

              <button
                onClick={() => handleRunWorker(5)}
                disabled={loading || !adminKey}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm font-medium rounded-lg hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PlayCircle className="w-4 h-4" />
                Run Worker x5 (250)
              </button>

              <button
                onClick={handleRetryFailed}
                disabled={loading || !adminKey || stats.failed === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-300 text-sm font-medium rounded-lg hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AlertCircle className="w-4 h-4" />
                Retry Failed (50)
              </button>
            </div>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-medium text-blue-300">Queued</span>
            </div>
            <div className="text-2xl font-bold text-ghoste-white">{stats.queued}</div>
          </div>

          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
              <span className="text-xs font-medium text-yellow-300">Sending</span>
            </div>
            <div className="text-2xl font-bold text-ghoste-white">{stats.sending}</div>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-300">Sent (Total)</span>
            </div>
            <div className="text-2xl font-bold text-ghoste-white">{stats.sent}</div>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-300">Sent (24h)</span>
            </div>
            <div className="text-2xl font-bold text-ghoste-white">{stats.sent_last_24h}</div>
          </div>

          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-xs font-medium text-red-300">Failed</span>
            </div>
            <div className="text-2xl font-bold text-ghoste-white">{stats.failed}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-ghoste-grey mb-1">
                Search by Email
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ghoste-grey" />
                <input
                  type="text"
                  value={emailSearch}
                  onChange={(e) => setEmailSearch(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full pl-10 pr-4 py-2 bg-ghoste-black/60 border border-white/10 rounded-lg text-sm text-ghoste-white placeholder-ghoste-grey/50 focus:outline-none focus:border-ghoste-blue/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ghoste-grey mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 bg-ghoste-black/60 border border-white/10 rounded-lg text-sm text-ghoste-white focus:outline-none focus:border-ghoste-blue/50"
              >
                <option value="all">All</option>
                <option value="queued">Queued</option>
                <option value="sending">Sending</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ghoste-grey mb-1">
                Template
              </label>
              <select
                value={templateFilter}
                onChange={(e) => setTemplateFilter(e.target.value)}
                className="px-4 py-2 bg-ghoste-black/60 border border-white/10 rounded-lg text-sm text-ghoste-white focus:outline-none focus:border-ghoste-blue/50"
              >
                <option value="all">All</option>
                {uniqueTemplates.map((template) => (
                  <option key={template} value={template}>
                    {template}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-ghoste-grey">
                {selectedIds.size} selected
              </span>
              <button
                onClick={handleRetrySelected}
                disabled={loading}
                className="text-xs text-ghoste-blue hover:text-ghoste-blue/80 font-medium"
              >
                Retry Selected
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-ghoste-grey hover:text-ghoste-white"
              >
                Clear Selection
              </button>
            </div>
          )}
        </div>

        {/* Outbox Table */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-sm font-semibold text-ghoste-white">
              Email Outbox ({filteredOutbox.length} rows)
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredOutbox.length && filteredOutbox.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-white/20"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ghoste-grey">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ghoste-grey">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ghoste-grey">Template</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ghoste-grey">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ghoste-grey">Sent At</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ghoste-grey">Attempts</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ghoste-grey">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredOutbox.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-ghoste-grey">
                      No emails found
                    </td>
                  </tr>
                ) : (
                  filteredOutbox.map((row) => (
                    <tr key={row.id} className="hover:bg-white/5">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          className="rounded border-white/20"
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-ghoste-grey">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-ghoste-white font-mono">
                        {row.to_email}
                      </td>
                      <td className="px-4 py-3 text-xs text-ghoste-grey">
                        {row.template_key}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(row.status)}
                      </td>
                      <td className="px-4 py-3 text-xs text-ghoste-grey">
                        {row.sent_at ? new Date(row.sent_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-ghoste-grey">
                        {row.attempts}
                      </td>
                      <td className="px-4 py-3 text-xs text-red-400 max-w-xs truncate" title={row.error || ''}>
                        {row.error || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Automation Events */}
        {events.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
            <div className="p-4 border-b border-white/10">
              <h2 className="text-sm font-semibold text-ghoste-white">
                Automation Events ({events.length} welcome_sent events)
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-ghoste-grey">Created</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-ghoste-grey">User ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-ghoste-grey">Event Key</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-ghoste-grey">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {events.map((event) => (
                    <tr key={event.id} className="hover:bg-white/5">
                      <td className="px-4 py-3 text-xs text-ghoste-grey">
                        {new Date(event.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-ghoste-white font-mono">
                        {event.user_id.substring(0, 8)}...
                      </td>
                      <td className="px-4 py-3 text-xs text-emerald-400">
                        {event.event_key}
                      </td>
                      <td className="px-4 py-3 text-xs text-ghoste-grey">
                        <pre className="text-[10px]">{JSON.stringify(event.payload, null, 2)}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
