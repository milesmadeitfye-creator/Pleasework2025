import React from "react";

const KEY = "__ghoste_last_crash_v1";
const PATH_KEY = "__ghoste_last_path_v1";
const ROUTE_KEY = "__ghoste_last_route_v1";

function read(key: string) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function manualLog() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      time: new Date().toISOString(),
      kind: "manual_log",
      message: "Manual debug log",
      path: location.pathname + location.search + location.hash
    }));
  } catch {}
}

export default function DebugCrash() {
  const [crashData, setCrashData] = React.useState<any>(read(KEY));
  const [pathData, setPathData] = React.useState<any>(read(PATH_KEY));
  const [routeData, setRouteData] = React.useState<any>(read(ROUTE_KEY));

  const refresh = () => {
    setCrashData(read(KEY));
    setPathData(read(PATH_KEY));
    setRouteData(read(ROUTE_KEY));
  };

  const clearAll = () => {
    localStorage.removeItem(KEY);
    localStorage.removeItem(PATH_KEY);
    localStorage.removeItem(ROUTE_KEY);
    refresh();
  };

  return (
    <div style={{ padding: 18, fontFamily: "ui-monospace, Menlo, Monaco, Consolas, monospace", maxWidth: 1200 }}>
      <h1 style={{ fontSize: 18 }}>Ghoste Debug Console</h1>

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={refresh} style={{ padding: "6px 12px", cursor: "pointer" }}>Refresh</button>
        <button onClick={clearAll} style={{ padding: "6px 12px", cursor: "pointer" }}>Clear All</button>
        <button onClick={() => (window.location.href = "/")} style={{ padding: "6px 12px", cursor: "pointer" }}>Home</button>
        <button onClick={() => (window.location.href = "/dashboard/overview?safe=1")} style={{ padding: "6px 12px", cursor: "pointer" }}>
          Overview Safe Mode
        </button>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => {
            throw new Error("DEBUG_TEST_CRASH");
          }}
          style={{ padding: "6px 12px", cursor: "pointer", background: "#dc2626", color: "white", border: "none", borderRadius: 4 }}
        >
          Test Crash
        </button>
        <button
          onClick={() => {
            Promise.reject(new Error("DEBUG_TEST_REJECTION"));
          }}
          style={{ padding: "6px 12px", cursor: "pointer", background: "#ea580c", color: "white", border: "none", borderRadius: 4 }}
        >
          Test Rejection
        </button>
        <button
          onClick={() => {
            manualLog();
            refresh();
          }}
          style={{ padding: "6px 12px", cursor: "pointer", background: "#2563eb", color: "white", border: "none", borderRadius: 4 }}
        >
          Manual Log
        </button>
      </div>

      <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
        {/* Last Crash */}
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Last Crash</div>
          {!crashData ? (
            <div style={{ padding: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", opacity: 0.6 }}>
              No crash stored yet.
            </div>
          ) : (
            <div style={{ padding: 12, borderRadius: 8, border: "1px solid rgba(220, 38, 38, 0.3)", background: "rgba(220, 38, 38, 0.05)" }}>
              <div><b>time:</b> {crashData.time}</div>
              <div><b>kind:</b> {crashData.kind}</div>
              {crashData.path && <div><b>path:</b> {crashData.path}</div>}
              <div style={{ marginTop: 10 }}><b>message:</b></div>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13 }}>{String(crashData.message)}</pre>
              {crashData.source && (
                <>
                  <div style={{ marginTop: 10 }}><b>source:</b></div>
                  <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12 }}>{String(crashData.source)}</pre>
                </>
              )}
              {crashData.stack && (
                <>
                  <div style={{ marginTop: 10 }}><b>stack:</b></div>
                  <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11, maxHeight: 200, overflow: "auto", background: "rgba(0,0,0,0.1)", padding: 8, borderRadius: 4 }}>
                    {String(crashData.stack)}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>

        {/* Last Route (React Router) */}
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Last Route (React Router)</div>
          {!routeData ? (
            <div style={{ padding: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", opacity: 0.6 }}>
              No route tracked yet.
            </div>
          ) : (
            <div style={{ padding: 12, borderRadius: 8, border: "1px solid rgba(37, 99, 235, 0.3)", background: "rgba(37, 99, 235, 0.05)" }}>
              <div><b>time:</b> {routeData.time}</div>
              <div><b>path:</b> {routeData.path}</div>
              <div><b>note:</b> {routeData.note}</div>
            </div>
          )}
        </div>

        {/* Last Path (Browser Navigation) */}
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Last Path (Browser Navigation)</div>
          {!pathData ? (
            <div style={{ padding: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", opacity: 0.6 }}>
              No path tracked yet.
            </div>
          ) : (
            <div style={{ padding: 12, borderRadius: 8, border: "1px solid rgba(34, 197, 94, 0.3)", background: "rgba(34, 197, 94, 0.05)" }}>
              <div><b>time:</b> {pathData.time}</div>
              <div><b>path:</b> {pathData.path}</div>
              <div><b>note:</b> {pathData.note}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24, opacity: 0.7, fontSize: 12, lineHeight: 1.6 }}>
        <div><b>Instructions:</b></div>
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          <li>After a crash, open <b>/debug</b> and screenshot this page</li>
          <li>Use "Test Crash" to verify error capturing works</li>
          <li>"Last Route" shows React Router navigation</li>
          <li>"Last Path" shows browser-level navigation events</li>
        </ul>
      </div>
    </div>
  );
}
