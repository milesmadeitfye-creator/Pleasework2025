import { Component, ReactNode } from 'react';
import { RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

/**
 * Global error boundary with user-friendly recovery UI
 * Catches all React errors and provides recovery options
 */
export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[GlobalErrorBoundary] Caught error:', error);
    console.error('[GlobalErrorBoundary] Error info:', errorInfo);

    this.setState({
      errorInfo: errorInfo.componentStack || null,
    });
  }

  handleReload = () => {
    // Clear recovery flag if it's a chunk error to allow fresh reload
    const errorMsg = this.state.error?.message || '';
    const isChunkError =
      errorMsg.includes('Failed to load') ||
      errorMsg.includes('chunk') ||
      errorMsg.includes('module');

    if (isChunkError) {
      sessionStorage.removeItem('ghoste_chunk_recover');
    }

    window.location.reload();
  };

  handleGoHome = () => {
    sessionStorage.removeItem('ghoste_chunk_recover');
    window.location.href = '/dashboard/overview';
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || 'Unknown error';
      const isChunkError =
        errorMsg.includes('Failed to load') ||
        errorMsg.includes('chunk') ||
        errorMsg.includes('module');

      return (
        <div className="min-h-screen bg-gradient-to-br from-[#020817] via-[#0a0f1e] to-[#020817] flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            {/* Error Card */}
            <div className="rounded-2xl border border-red-500/20 bg-black/40 backdrop-blur-xl p-8">
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className="h-16 w-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <svg
                    className="h-8 w-8 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
              </div>

              {/* Title */}
              <h1 className="text-2xl font-bold text-white text-center mb-2">
                Something went wrong
              </h1>

              {/* Message */}
              <p className="text-white/70 text-center mb-6">
                {isChunkError ? (
                  <>
                    Ghoste was recently updated. <br />
                    <span className="text-white/90 font-medium">Reloading will fix this.</span>
                  </>
                ) : (
                  <>
                    An unexpected error occurred. <br />
                    We're sorry for the inconvenience.
                  </>
                )}
              </p>

              {/* Error Details (collapsible) */}
              {process.env.NODE_ENV === 'development' && (
                <details className="mb-6 rounded-lg bg-red-500/5 border border-red-500/10 p-3">
                  <summary className="text-xs text-red-300 cursor-pointer font-mono">
                    Error Details (Dev Only)
                  </summary>
                  <pre className="mt-2 text-[10px] text-red-200/70 overflow-x-auto">
                    {errorMsg}
                  </pre>
                </details>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={this.handleReload}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-3 text-sm font-semibold text-white hover:from-blue-500 hover:to-cyan-500 transition-all"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload Page
                </button>

                <button
                  onClick={this.handleGoHome}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-white/10 border border-white/20 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15 transition-all"
                >
                  <Home className="h-4 w-4" />
                  Go to Overview
                </button>
              </div>

              {/* Support Link */}
              <p className="mt-6 text-center text-xs text-white/40">
                If this keeps happening, please{' '}
                <a
                  href="https://ghoste.one"
                  className="text-cyan-400 hover:text-cyan-300 underline"
                >
                  contact support
                </a>
              </p>
            </div>

            {/* Ghoste Branding */}
            <div className="mt-8 text-center">
              <div className="inline-flex items-center gap-2 text-white/30 text-xs">
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
                </svg>
                <span>Protected by Ghoste</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
