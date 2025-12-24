/**
 * Automation Logs Page
 *
 * Displays logs for:
 * - Email automation runs
 * - Marketing automation
 * - Ad campaign automation
 * - Notification sequences
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { AlertCircle, CheckCircle2, Clock, XCircle, RefreshCw } from 'lucide-react';

interface LogEntry {
  id: string;
  type: string;
  status: string;
  message: string;
  created_at: string;
  details?: any;
}

export default function AutomationLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed' | 'pending'>('all');

  useEffect(() => {
    loadLogs();
  }, [filter]);

  async function loadLogs() {
    setLoading(true);
    try {
      // Try to load email_jobs as sample automation logs
      let query = supabase
        .from('email_jobs')
        .select('id, to_email, template_key, subject, status, last_error, created_at, sent_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter !== 'all') {
        if (filter === 'success') {
          query = query.eq('status', 'sent');
        } else if (filter === 'failed') {
          query = query.eq('status', 'failed');
        } else if (filter === 'pending') {
          query = query.in('status', ['pending', 'sending']);
        }
      }

      const { data, error } = await query;

      if (error) {
        console.error('[AutomationLogs] Error loading logs:', error);
        setLogs([]);
      } else {
        // Transform email_jobs into log entries
        const transformedLogs: LogEntry[] = (data || []).map(job => ({
          id: job.id,
          type: 'email',
          status: job.status === 'sent' ? 'success' : job.status === 'failed' ? 'failed' : 'pending',
          message: `${job.template_key}: ${job.subject} → ${job.to_email}`,
          created_at: job.created_at,
          details: {
            subject: job.subject,
            to_email: job.to_email,
            template_key: job.template_key,
            sent_at: job.sent_at,
            last_error: job.last_error,
          },
        }));
        setLogs(transformedLogs);
      }
    } catch (err) {
      console.error('[AutomationLogs] Unexpected error:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-400" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'success':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-ghoste-text mb-2">Automation Logs</h1>
        <p className="text-ghoste-text-muted">
          Monitor your automated processes and troubleshoot issues
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-2">
          {(['all', 'success', 'failed', 'pending'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === f
                  ? 'bg-ghoste-accent text-white'
                  : 'bg-ghoste-surface text-ghoste-text-muted hover:text-ghoste-text'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <button
          onClick={loadLogs}
          disabled={loading}
          className="ml-auto px-4 py-2 bg-ghoste-surface text-ghoste-text rounded-lg hover:bg-ghoste-surface/80 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Logs List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-ghoste-accent"></div>
          <p className="text-ghoste-text-muted mt-4">Loading logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 bg-ghoste-surface rounded-xl border border-ghoste-border">
          <AlertCircle className="w-12 h-12 text-ghoste-text-muted mx-auto mb-4" />
          <p className="text-ghoste-text-muted">No logs found</p>
          <p className="text-ghoste-text-secondary text-sm mt-2">
            {filter !== 'all' ? 'Try changing the filter' : 'Automation logs will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="bg-ghoste-surface rounded-xl border border-ghoste-border p-4 hover:border-ghoste-accent/50 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-1">{getStatusIcon(log.status)}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(
                        log.status
                      )}`}
                    >
                      {log.status}
                    </span>
                    <span className="text-xs text-ghoste-text-secondary uppercase tracking-wide">
                      {log.type}
                    </span>
                    <span className="text-xs text-ghoste-text-secondary ml-auto">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-ghoste-text font-medium mb-1">{log.message}</p>

                  {log.details?.last_error && (
                    <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <p className="text-red-400 text-sm font-mono">{log.details.last_error}</p>
                    </div>
                  )}

                  {log.details?.sent_at && (
                    <p className="text-ghoste-text-secondary text-sm mt-2">
                      Sent at: {new Date(log.details.sent_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
