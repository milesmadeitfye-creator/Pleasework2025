import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface MetaEventLog {
  id: string;
  event_name: string;
  event_id: string;
  source: string;
  pixel_id: string | null;
  link_type: string | null;
  created_at: string;
  success: boolean;
  error_message: string | null;
  meta_response: any;
  payload: any;
}

export default function MetaEventLogsPanel() {
  const [logs, setLogs] = useState<MetaEventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('meta_event_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter === 'success') {
        query = query.eq('success', true);
      } else if (filter === 'failed') {
        query = query.eq('success', false);
      }

      const { data, error } = await query;

      if (error) {
        // If table doesn't exist or other DB error, just log and continue with empty logs
        console.warn('[MetaEventLogsPanel] Could not fetch logs (table may not exist):', error.message);
        setLogs([]);
        return;
      }

      setLogs(data || []);
    } catch (err: any) {
      console.error('[MetaEventLogsPanel] Failed to fetch meta event logs:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  const sendTestEvent = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const eventId = `test_${Date.now()}`;
      const res = await fetch('/.netlify/functions/meta-track-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          event_name: 'GhosteTestEvent',
          event_id: eventId,
          event_source_url: window.location.href,
          test_mode: true, // Forces TEST62806 code
          custom_data: {
            test: true,
            timestamp: new Date().toISOString(),
          },
        }),
      });

      const result = await res.json();
      console.log('Test event result:', result);

      // Refresh logs after 1 second
      setTimeout(fetchLogs, 1000);

      if (result.success) {
        alert(`✓ Test event sent successfully!\n\nEvent ID: ${eventId}\nPixel: ${result.pixel_id}\nTest Code: ${result.test_event_code}\n\nCheck Meta Test Events dashboard.`);
      } else {
        alert(`✗ Test event failed\n\nError: ${result.error}\n${result.message || ''}`);
      }
    } catch (err: any) {
      console.error('Test event error:', err);
      alert(`Error sending test event: ${err.message}`);
    }
  };

  const getStatusIcon = (success: boolean, error: string | null) => {
    if (success) return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (error) return <XCircle className="w-5 h-5 text-red-500" />;
    return <AlertCircle className="w-5 h-5 text-yellow-500" />;
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);

    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Meta Event Logs</h3>
            <p className="text-sm text-gray-600 mt-1">
              Track all Meta Pixel and CAPI events with responses
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={sendTestEvent}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
            >
              Send Test Event
            </button>
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh logs"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('success')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'success'
                ? 'bg-green-100 text-green-700'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            Success
          </button>
          <button
            onClick={() => setFilter('failed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'failed'
                ? 'bg-red-100 text-red-700'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            Failed
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p>Loading logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="mb-2">No events logged yet</p>
            <p className="text-sm">Click "Send Test Event" to create your first event</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Event
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Pixel ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Response
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  >
                    <td className="px-4 py-3">
                      {getStatusIcon(log.success, log.error_message)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatTime(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{log.event_name}</div>
                      <div className="text-xs text-gray-500 font-mono">{log.event_id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">
                        {log.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {log.pixel_id ? `${log.pixel_id.substring(0, 10)}...` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {log.success ? (
                        <span className="text-green-600">✓ Sent</span>
                      ) : (
                        <span className="text-red-600">{log.error_message || 'Failed'}</span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded Details */}
                  {expandedLog === log.id && (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 bg-gray-50">
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900 mb-2">Meta Response</h4>
                            <pre className="bg-white p-3 rounded border border-gray-200 text-xs overflow-auto max-h-40">
                              {JSON.stringify(log.meta_response, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900 mb-2">Payload Sent</h4>
                            <pre className="bg-white p-3 rounded border border-gray-200 text-xs overflow-auto max-h-40">
                              {JSON.stringify(log.payload, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50 text-sm text-gray-600">
        <p>
          Showing last 50 events.
          {logs.some(l => l.payload?.test_event_code || l.meta_response?.test_event_code) && (
            <span className="ml-2 text-purple-600 font-medium">
              Test events are being sent with code: TEST62806
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
