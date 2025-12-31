import { Copy, X } from 'lucide-react';
import { useState } from 'react';

interface AdsDebugPanelProps {
  metaStatus?: any;
  smartLink?: any;
  payload?: any;
  response?: any;
  timing?: { start?: number; end?: number };
  onCopy?: () => void;
}

function sanitizeValue(val: any): any {
  if (typeof val === 'string') {
    if (val.match(/^(sk_|pk_|rk_|token_|AT|EAA|Bearer)/i)) {
      return '[REDACTED_SECRET]';
    }
    if (val.includes('access_token') || val.includes('secret')) {
      return '[REDACTED]';
    }
  }

  if (Array.isArray(val)) {
    return val.map(sanitizeValue);
  }

  if (val && typeof val === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(val)) {
      if (key.match(/(token|secret|key|password|auth|bearer)/i)) {
        cleaned[key] = '[REDACTED]';
      } else {
        cleaned[key] = sanitizeValue(value);
      }
    }
    return cleaned;
  }

  return val;
}

export function AdsDebugPanel({
  metaStatus,
  smartLink,
  payload,
  response,
  timing,
  onCopy,
}: AdsDebugPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const sanitizedPayload = payload ? sanitizeValue(payload) : null;
  const sanitizedResponse = response ? sanitizeValue(response) : null;
  const duration = timing?.start && timing?.end ? timing.end - timing.start : null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t-2 border-yellow-500 text-white shadow-2xl"
      style={{ maxHeight: collapsed ? '48px' : '35vh' }}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-yellow-400 font-mono text-sm font-bold">
            🐛 ADS DEBUG PANEL
          </span>
          <span className="text-xs text-gray-400">
            {response ? (
              <span className={response.ok ? 'text-green-400' : 'text-red-400'}>
                Status: {response.status || 'N/A'} {response.ok ? '✓' : '✗'}
              </span>
            ) : (
              'Waiting for submit...'
            )}
          </span>
          {duration && (
            <span className="text-xs text-blue-400">
              {duration}ms
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCopy && (
            <button
              onClick={onCopy}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title="Copy debug data"
            >
              <Copy className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="overflow-auto p-4 space-y-3" style={{ maxHeight: 'calc(35vh - 48px)' }}>
          {metaStatus && (
            <div className="bg-gray-800 rounded p-3">
              <div className="text-xs font-semibold text-blue-300 mb-1">META STATUS:</div>
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                {JSON.stringify(sanitizeValue(metaStatus), null, 2)}
              </pre>
            </div>
          )}

          {smartLink && (
            <div className="bg-gray-800 rounded p-3">
              <div className="text-xs font-semibold text-green-300 mb-1">SMART LINK:</div>
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                {JSON.stringify(sanitizeValue(smartLink), null, 2)}
              </pre>
            </div>
          )}

          {sanitizedPayload && (
            <div className="bg-gray-800 rounded p-3">
              <div className="text-xs font-semibold text-purple-300 mb-1">PAYLOAD SENT:</div>
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                {JSON.stringify(sanitizedPayload, null, 2)}
              </pre>
            </div>
          )}

          {sanitizedResponse && (
            <div className="bg-gray-800 rounded p-3">
              <div className="text-xs font-semibold text-yellow-300 mb-1">RESPONSE:</div>
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                {JSON.stringify(sanitizedResponse, null, 2)}
              </pre>
            </div>
          )}

          {!metaStatus && !smartLink && !sanitizedPayload && !sanitizedResponse && (
            <div className="text-center text-gray-400 text-sm py-8">
              Debug data will appear here after you click "Launch Campaign"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
