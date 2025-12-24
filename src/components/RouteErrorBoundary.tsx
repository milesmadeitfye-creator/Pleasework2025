import React from 'react';

interface Props {
  children: React.ReactNode;
  routeName: string;
}

interface State {
  hasError: boolean;
  error: any;
}

interface SavedCrash {
  route: string;
  time: string;
  message: string;
  stack?: string;
  info?: any;
}

export class RouteErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: any): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    console.error(`[RouteErrorBoundary] ${this.props.routeName} crashed:`, error);
    console.error('[RouteErrorBoundary] Error info:', info);

    try {
      const crashData = {
        time: new Date().toISOString(),
        kind: "react_error_boundary",
        message: String(error?.message || error),
        stack: error?.stack,
        source: this.props.routeName,
        info,
        path: location.pathname + location.search + location.hash
      };
      // Use unified crash key
      localStorage.setItem('__ghoste_last_crash_v1', JSON.stringify(crashData));
      console.log('[RouteErrorBoundary] Crash saved to localStorage');
    } catch (err) {
      console.error('[RouteErrorBoundary] Failed to save crash:', err);
    }
  }

  handleClearAndRetry = () => {
    try {
      localStorage.removeItem('__ghoste_last_crash_v1');
    } catch {}
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleGoToListeningParties = () => {
    window.location.href = '/listening-parties';
  };

  handleGoToAutomationLogs = () => {
    window.location.href = '/automation-logs';
  };

  render() {
    if (this.state.hasError) {
      const saved = (() => {
        try {
          const raw = localStorage.getItem('__ghoste_last_crash_v1');
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })();

      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
          <div className="max-w-3xl w-full bg-gray-900 border border-gray-800 rounded-xl p-8">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {this.props.routeName} failed to load
              </h1>
              <p className="text-gray-400">
                We kept the app running. You can still navigate to other pages.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 justify-center mb-6">
              <button
                onClick={this.handleGoHome}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Go Home
              </button>
              <button
                onClick={this.handleGoToListeningParties}
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors border border-gray-700"
              >
                Listening Parties
              </button>
              <button
                onClick={this.handleGoToAutomationLogs}
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors border border-gray-700"
              >
                Automation Logs
              </button>
            </div>

            {saved && (
              <div className="mb-6">
                <div className="text-sm font-semibold text-yellow-400 mb-2 uppercase tracking-wide">
                  Crash Details (Saved)
                </div>
                <div className="bg-gray-950 border border-yellow-900/50 rounded-lg p-4 space-y-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Route</div>
                    <div className="text-sm text-gray-300 font-mono">{saved.route}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 mb-1">Time</div>
                    <div className="text-sm text-gray-300 font-mono">
                      {new Date(saved.time).toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 mb-1">Message</div>
                    <div className="text-sm text-yellow-300 font-mono break-all">
                      {saved.message}
                    </div>
                  </div>

                  {saved.stack && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Stack Trace</div>
                      <div className="text-xs text-gray-400 font-mono break-all max-h-32 overflow-auto bg-gray-900 p-2 rounded">
                        {saved.stack}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-center">
              <button
                onClick={this.handleClearAndRetry}
                className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors"
              >
                Clear Crash & Retry
              </button>
            </div>

            <p className="text-center text-xs text-gray-500 mt-6">
              If this problem persists, please contact support with the crash details above
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
