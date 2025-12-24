import React from "react";

export default class SoftRouteBoundary extends React.Component<
  { children: React.ReactNode; name: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    console.error(`[SoftRouteBoundary] ${this.props.name} crashed:`, error);

    try {
      localStorage.setItem("__ghoste_last_crash_v1", JSON.stringify({
        time: new Date().toISOString(),
        kind: "react_error_boundary",
        message: String(error?.message || error),
        stack: error?.stack,
        source: this.props.name,
        info,
        path: location.pathname + location.search + location.hash
      }));
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h1>{this.props.name} failed to load</h1>
          <p>We kept the app running.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button onClick={() => (window.location.href = "/debug")}>Open Debug</button>
            <button onClick={() => (window.location.href = "/dashboard/overview?safe=1")}>Open Overview Safe Mode</button>
            <button onClick={() => (window.location.href = "/")}>Home</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
