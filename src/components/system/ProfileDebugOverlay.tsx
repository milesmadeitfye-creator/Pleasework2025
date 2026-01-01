import { useState, useEffect } from 'react';
import { X, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface LogEntry {
  ts: string;
  level: 'log' | 'warn' | 'error';
  args: any[];
}

declare global {
  interface Window {
    __ghoste_logs?: LogEntry[];
    __ghoste_last_error?: {
      message: string;
      stack: string;
      componentStack: string;
      time: string;
      path: string;
    };
  }
}

const MAX_LOGS = 200;

export function ProfileDebugOverlay() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<Window['__ghoste_last_error'] | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    // Check URL for ?debug=1
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      setVisible(true);
      setExpanded(true);
    }

    // Keyboard shortcut Ctrl+Shift+D
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setVisible(prev => !prev);
        if (!visible) setExpanded(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    // Install log capture monkeypatch
    if (!window.__ghoste_logs) {
      window.__ghoste_logs = [];

      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;

      console.log = function (...args: any[]) {
        if (window.__ghoste_logs) {
          window.__ghoste_logs.push({
            ts: new Date().toISOString(),
            level: 'log',
            args,
          });
          if (window.__ghoste_logs.length > MAX_LOGS) {
            window.__ghoste_logs.shift();
          }
        }
        originalLog.apply(console, args);
      };

      console.warn = function (...args: any[]) {
        if (window.__ghoste_logs) {
          window.__ghoste_logs.push({
            ts: new Date().toISOString(),
            level: 'warn',
            args,
          });
          if (window.__ghoste_logs.length > MAX_LOGS) {
            window.__ghoste_logs.shift();
          }
        }
        originalWarn.apply(console, args);
      };

      console.error = function (...args: any[]) {
        if (window.__ghoste_logs) {
          window.__ghoste_logs.push({
            ts: new Date().toISOString(),
            level: 'error',
            args,
          });
          if (window.__ghoste_logs.length > MAX_LOGS) {
            window.__ghoste_logs.shift();
          }
        }
        originalError.apply(console, args);
      };
    }

    // Poll for logs and errors
    const interval = setInterval(() => {
      if (window.__ghoste_logs) {
        setLogs([...window.__ghoste_logs]);
      }
      if (window.__ghoste_last_error) {
        setError({ ...window.__ghoste_last_error });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [visible]);

  const handleCopyDebugReport = () => {
    const parts = [
      '=== GHOSTE DEBUG REPORT ===',
      `Time: ${new Date().toISOString()}`,
      `User ID: ${user?.id || 'Not authenticated'}`,
      `Path: ${window.location.pathname}`,
      '',
    ];

    if (error) {
      parts.push('=== ERROR ===');
      parts.push(`Message: ${error.message}`);
      parts.push(`Time: ${error.time}`);
      parts.push(`Path: ${error.path}`);
      parts.push('');
      parts.push('Stack:');
      parts.push(error.stack);
      parts.push('');
      parts.push('Component Stack:');
      parts.push(error.componentStack);
      parts.push('');
    }

    parts.push('=== LOGS (Last 200) ===');
    logs.forEach((log) => {
      const args = log.args.map((arg) => {
        try {
          return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
        } catch {
          return '[Circular]';
        }
      }).join(' ');
      parts.push(`[${log.ts}] [${log.level.toUpperCase()}] ${args}`);
    });

    const report = parts.join('\n');

    try {
      navigator.clipboard.writeText(report);
      alert('Debug report copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy debug report:', err);
      alert('Failed to copy debug report');
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[9999] bg-gray-950 border-t border-gray-800 shadow-2xl transition-all ${
        expanded ? 'h-[500px]' : 'h-12'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-gray-800 rounded transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <span className="text-sm font-semibold text-white">
            Debug Overlay
          </span>
          {error && (
            <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">
              Error Detected
            </span>
          )}
          <span className="text-xs text-gray-500">
            {logs.length} logs | Ctrl+Shift+D to toggle
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyDebugReport}
            className="flex items-center gap-1.5 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded transition-colors"
          >
            <Copy className="w-3 h-3" />
            Copy Debug Report
          </button>
          <button
            onClick={() => setVisible(false)}
            className="p-1 hover:bg-gray-800 rounded transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="h-[calc(100%-48px)] overflow-hidden flex flex-col">
          {/* Error Section */}
          {error && (
            <div className="p-4 bg-red-950/50 border-b border-red-900/50">
              <div className="text-xs font-semibold text-red-400 mb-2 uppercase">
                Last Error
              </div>
              <div className="text-sm text-red-300 font-mono mb-1">
                {error.message}
              </div>
              <div className="text-xs text-gray-500">
                {error.time} | {error.path}
              </div>
              <details className="mt-2">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                  Show Stack Trace
                </summary>
                <pre className="mt-2 text-xs text-gray-400 overflow-auto max-h-32 bg-gray-900 p-2 rounded">
                  {error.stack}
                </pre>
              </details>
            </div>
          )}

          {/* Logs Section */}
          <div className="flex-1 overflow-auto p-4 space-y-1 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                No logs captured yet. Logs will appear here as actions occur.
              </div>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${
                    log.level === 'error'
                      ? 'text-red-400'
                      : log.level === 'warn'
                      ? 'text-yellow-400'
                      : 'text-gray-400'
                  }`}
                >
                  <span className="text-gray-600 whitespace-nowrap">
                    {new Date(log.ts).toLocaleTimeString()}
                  </span>
                  <span className="font-semibold w-12">{log.level.toUpperCase()}</span>
                  <span className="flex-1 break-all">
                    {log.args.map((arg) => {
                      try {
                        return typeof arg === 'object'
                          ? JSON.stringify(arg, null, 2)
                          : String(arg);
                      } catch {
                        return '[Circular]';
                      }
                    }).join(' ')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
