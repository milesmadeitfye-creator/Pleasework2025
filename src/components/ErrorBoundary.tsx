import React from "react";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: err?.message || "Unknown error" };
  }

  componentDidCatch(err: any, info: any) {
    console.error("[ErrorBoundary]", err, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", backgroundColor: "#0a0a0a", color: "#fff" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Something went wrong</h2>
          <p style={{ opacity: 0.8, marginBottom: 20 }}>{this.state.message}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "8px 16px", backgroundColor: "#3b82f6", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: 14 }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children as any;
  }
}
