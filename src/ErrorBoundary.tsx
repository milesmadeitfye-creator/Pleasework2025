import React from "react";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("App crashed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, color: "#e5e7eb", background: "#020817", fontFamily: "system-ui" }}>
          <h1>Something went wrong.</h1>
          <p>If you're the admin, open the console to see the error details.</p>
          {this.state.error && (
            <details style={{ marginTop: 16, fontSize: 14, opacity: 0.7 }}>
              <summary style={{ cursor: "pointer" }}>Error Details</summary>
              <pre style={{ marginTop: 8, overflow: "auto" }}>
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
