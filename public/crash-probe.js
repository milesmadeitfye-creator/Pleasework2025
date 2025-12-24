(function () {
  const KEY = "__ghoste_last_crash_v1";
  const PATH_KEY = "__ghoste_last_path_v1";

  function write(payload) {
    try {
      // Always include current path in crash logs
      payload.path = location.pathname + location.search + location.hash;
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function writePath(note) {
    try {
      localStorage.setItem(PATH_KEY, JSON.stringify({
        time: new Date().toISOString(),
        path: location.pathname + location.search + location.hash,
        note: note
      }));
    } catch (e) {}
  }

  // Capture window errors
  window.addEventListener("error", function (event) {
    write({
      time: new Date().toISOString(),
      kind: "error",
      message: String(event && event.message ? event.message : "Unknown window error"),
      source: event && event.filename ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}` : "window",
      stack: event && event.error && event.error.stack ? String(event.error.stack) : null,
    });
  });

  // Capture unhandled promise rejections
  window.addEventListener("unhandledrejection", function (event) {
    const r = event && event.reason ? event.reason : null;
    write({
      time: new Date().toISOString(),
      kind: "rejection",
      message: String((r && r.message) || r || "Unhandled promise rejection"),
      source: "unhandledrejection",
      stack: r && r.stack ? String(r.stack) : null,
    });
  });

  // Track last path frequently for navigation debugging
  writePath("probe_loaded");

  window.addEventListener("popstate", function() { writePath("popstate"); });
  window.addEventListener("hashchange", function() { writePath("hashchange"); });

  // Track reload/close events
  window.addEventListener("beforeunload", function() { writePath("beforeunload"); });
  window.addEventListener("pagehide", function() { writePath("pagehide"); });

  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden") {
      writePath("visibility_hidden");
    }
  });
})();
