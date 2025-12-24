import { Component, ReactNode } from 'react';
import { readCrash, clearCrash, type GhosteCrash } from '../debug/errorLog';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
  persistedCrash: GhosteCrash | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      persistedCrash: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    // Read persisted crash from localStorage
    const persistedCrash = readCrash();

    this.setState({
      errorInfo,
      persistedCrash
    });

    console.error('[AppErrorBoundary] Caught error:', error);
    console.error('[AppErrorBoundary] Error info:', errorInfo);

    if (persistedCrash) {
      console.error('[AppErrorBoundary] Persisted crash found:', persistedCrash);
    }

    const isWebSocketError =
      error?.message?.toLowerCase().includes('websocket') ||
      error?.message?.toLowerCase().includes('operation is insecure') ||
      error?.message?.toLowerCase().includes('ws://') ||
      error?.message?.toLowerCase().includes('wss://');

    if (isWebSocketError) {
      console.warn('[AppErrorBoundary] WebSocket error detected - setting wsDisabled flag');
      try {
        if (typeof window !== 'undefined') {
          (window as any).__wsDisabled = true;
        }
      } catch (err) {
        console.warn('[AppErrorBoundary] Failed to set wsDisabled flag:', err);
      }
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearAndReload = () => {
    clearCrash();
    window.location.reload();
  };

  handleCopyError = () => {
    const parts = [
      `Error: ${this.state.error?.message || 'Unknown error'}`,
      `Stack: ${this.state.error?.stack || 'No stack trace'}`,
      `Component Stack: ${this.state.errorInfo?.componentStack || 'No component stack'}`
    ];

    // Add persisted crash if available
    if (this.state.persistedCrash) {
      parts.push('');
      parts.push('=== PERSISTED CRASH FROM LOCALSTORAGE ===');
      parts.push(`Time: ${this.state.persistedCrash.time}`);
      parts.push(`Kind: ${this.state.persistedCrash.kind}`);
      parts.push(`Message: ${this.state.persistedCrash.message}`);
      parts.push(`URL: ${this.state.persistedCrash.url || 'unknown'}`);
      if (this.state.persistedCrash.stack) {
        parts.push(`Stack: ${this.state.persistedCrash.stack}`);
      }
      if (this.state.persistedCrash.extra) {
        parts.push(`Extra: ${JSON.stringify(this.state.persistedCrash.extra, null, 2)}`);
      }
    }

    const errorText = parts.join('\n\n');

    try {
      navigator.clipboard.writeText(errorText);
      alert('Error details copied to clipboard');
    } catch (err) {
      console.error('Failed to copy error:', err);
      alert('Failed to copy error details');
    }
  };

  render() {
    if (this.state.hasError) {
      const { error, persistedCrash } = this.state;

      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
          <div className="max-w-3xl w-full bg-gray-900 border border-gray-800 rounded-xl p-8">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h1 className="text-3xl font-bold text-white mb-2">Something went wrong</h1>
              <p className="text-gray-400">
                An unexpected error occurred. Please reload the page to continue.
              </p>
            </div>

            {/* Current Error */}
            {error && (
              <div className="mb-6">
                <div className="text-sm font-semibold text-red-400 mb-2 uppercase tracking-wide">
                  Current Error
                </div>
                <div className="bg-gray-950 border border-red-900/50 rounded-lg p-4 max-h-48 overflow-auto">
                  <p className="text-sm text-red-400 font-mono break-all">
                    {error.message}
                  </p>
                </div>
              </div>
            )}

            {/* Persisted Crash from localStorage */}
            {persistedCrash && (
              <div className="mb-6">
                <div className="text-sm font-semibold text-yellow-400 mb-2 uppercase tracking-wide flex items-center gap-2">
                  <span>🔍 Crash Details (Saved)</span>
                  <span className="text-xs text-gray-500 normal-case">
                    {persistedCrash.kind}
                  </span>
                </div>
                <div className="bg-gray-950 border border-yellow-900/50 rounded-lg p-4 space-y-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Time</div>
                    <div className="text-sm text-gray-300 font-mono">
                      {new Date(persistedCrash.time).toLocaleString()}
                    </div>
                  </div>

                  {persistedCrash.url && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1">URL</div>
                      <div className="text-sm text-gray-300 font-mono break-all">
                        {persistedCrash.url}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs text-gray-500 mb-1">Message</div>
                    <div className="text-sm text-yellow-300 font-mono break-all">
                      {persistedCrash.message}
                    </div>
                  </div>

                  {persistedCrash.stack && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Stack Trace</div>
                      <div className="text-xs text-gray-400 font-mono break-all max-h-32 overflow-auto bg-gray-900 p-2 rounded">
                        {persistedCrash.stack}
                      </div>
                    </div>
                  )}

                  {persistedCrash.extra && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Additional Info</div>
                      <div className="text-xs text-gray-400 font-mono">
                        {JSON.stringify(persistedCrash.extra, null, 2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleCopyError}
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors border border-gray-700"
              >
                Copy Error Details
              </button>
              {persistedCrash && (
                <button
                  onClick={this.handleClearAndReload}
                  className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors"
                >
                  Clear Crash & Reload
                </button>
              )}
            </div>

            <p className="text-center text-xs text-gray-500 mt-6">
              If this problem persists, please contact support with the error details above
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
