/**
 * Emergency Crash Overlay - Debug Mode Only
 *
 * Activated by:
 * - Adding ?debug=1 to URL
 * - Setting localStorage.GHOSTE_DEBUG = "1"
 *
 * Shows real error messages on mobile/desktop when app crashes
 */

import React from 'react';

export type CrashPayload = {
  message: string;
  stack?: string;
  source?: string;
  time: string;
  type?: 'error' | 'unhandledrejection';
};

/**
 * Install global crash handlers that capture all errors
 * These run BEFORE React error boundaries
 */
export function installGlobalCrashHandlers(onCrash: (p: CrashPayload) => void) {
  // Capture synchronous errors
  window.onerror = (message, source, lineno, colno, error) => {
    console.log('[CrashOverlay] window.onerror captured:', {
      message,
      source,
      lineno,
      colno,
      error,
    });

    onCrash({
      type: 'error',
      message: String(message),
      stack: error?.stack,
      source: `${source || 'unknown'}:${lineno || 0}:${colno || 0}`,
      time: new Date().toISOString(),
    });

    return false; // Allow default handler to also run
  };

  // Capture async/promise errors
  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const reason: any = event.reason;

    console.log('[CrashOverlay] unhandledrejection captured:', reason);

    onCrash({
      type: 'unhandledrejection',
      message: String(reason?.message || reason || 'Unhandled promise rejection'),
      stack: reason?.stack,
      source: 'unhandledrejection',
      time: new Date().toISOString(),
    });
  };

  console.log('[CrashOverlay] Global crash handlers installed');
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  try {
    const url = new URL(window.location.href);
    const debugParam = url.searchParams.get('debug') === '1';
    const debugLocal = localStorage.getItem('GHOSTE_DEBUG') === '1';

    return debugParam || debugLocal;
  } catch {
    return false;
  }
}

/**
 * Crash Overlay Component
 * Displays crash details in full-screen overlay
 */
export default function CrashOverlay({
  crash,
  onDismiss,
}: {
  crash: CrashPayload | null;
  onDismiss: () => void;
}) {
  if (!crash) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(0, 0, 0, 0.95)',
        color: '#ffffff',
        padding: 16,
        overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
          paddingBottom: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: '#ef4444' }}>
          ⚠️ Ghoste Debug: Crash Detected
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: 'white',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Dismiss
        </button>
      </div>

      {/* Crash Type Badge */}
      <div
        style={{
          display: 'inline-block',
          background: 'rgba(239, 68, 68, 0.2)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          color: '#fca5a5',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        {crash.type || 'error'}
      </div>

      {/* Timestamp */}
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16 }}>
        {new Date(crash.time).toLocaleString()}
      </div>

      {/* Error Message */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#fbbf24',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Error Message
        </div>
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            padding: 12,
          }}
        >
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 13,
              color: '#fecaca',
              fontWeight: 500,
            }}
          >
            {crash.message}
          </pre>
        </div>
      </div>

      {/* Source */}
      {crash.source && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#fbbf24',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Source Location
          </div>
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 12,
                color: '#93c5fd',
              }}
            >
              {crash.source}
            </pre>
          </div>
        </div>
      )}

      {/* Stack Trace */}
      {crash.stack && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#fbbf24',
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Stack Trace
          </div>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              padding: 12,
              maxHeight: 400,
              overflow: 'auto',
            }}
          >
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 11,
                color: '#d1d5db',
                lineHeight: 1.8,
              }}
            >
              {crash.stack}
            </pre>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div
        style={{
          marginTop: 24,
          padding: 16,
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: '#93c5fd', marginBottom: 8 }}>
          💡 What to do:
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#d1d5db' }}>
          <li style={{ marginBottom: 6 }}>Take a screenshot of this error</li>
          <li style={{ marginBottom: 6 }}>Send it to the development team</li>
          <li style={{ marginBottom: 6 }}>
            Include what you were doing when the crash happened
          </li>
          <li>Try refreshing the page or clearing your cache</li>
        </ul>
      </div>

      {/* Debug Mode Info */}
      <div
        style={{
          marginTop: 16,
          padding: 12,
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 8,
          fontSize: 11,
          color: '#9ca3af',
          textAlign: 'center',
        }}
      >
        Debug Mode Active • To disable: remove ?debug=1 from URL or delete localStorage.GHOSTE_DEBUG
      </div>

      {/* Action Buttons */}
      <div
        style={{
          marginTop: 20,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => {
            navigator.clipboard.writeText(
              `Error: ${crash.message}\n\nSource: ${crash.source || 'N/A'}\n\nStack:\n${crash.stack || 'N/A'}\n\nTime: ${crash.time}`
            );
            alert('Error details copied to clipboard!');
          }}
          style={{
            background: 'rgba(59, 130, 246, 0.2)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            color: '#93c5fd',
            padding: '8px 16px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          📋 Copy Error
        </button>

        <button
          onClick={() => window.location.reload()}
          style={{
            background: 'rgba(34, 197, 94, 0.2)',
            border: '1px solid rgba(34, 197, 94, 0.4)',
            color: '#86efac',
            padding: '8px 16px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          🔄 Reload Page
        </button>

        <button
          onClick={() => {
            localStorage.removeItem('GHOSTE_DEBUG');
            const url = new URL(window.location.href);
            url.searchParams.delete('debug');
            window.location.href = url.toString();
          }}
          style={{
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            padding: '8px 16px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          🚫 Disable Debug Mode
        </button>
      </div>
    </div>
  );
}
