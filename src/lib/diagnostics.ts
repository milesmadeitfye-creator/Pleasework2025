/**
 * Global Diagnostics System
 *
 * Captures runtime errors, promise rejections, network failures, and logs them
 * to localStorage for in-app debugging without needing console access.
 */

export type DiagLevel = "info" | "warn" | "error";
export type DiagType = "runtime" | "promise" | "react" | "network" | "supabase" | "meta" | "ws" | "build";

export interface DiagEvent {
  ts: string;
  level: DiagLevel;
  type: DiagType;
  message: string;
  stack?: string;
  path?: string;
  extra?: any;
}

const STORAGE_KEY = "ghoste_diag_logs_v1";
const MAX_LOGS = 300;

let initialized = false;

/**
 * Initialize global error handlers
 */
export function initDiagnostics(): void {
  if (initialized) return;
  initialized = true;

  // Capture runtime errors
  window.addEventListener("error", (event) => {
    logDiag({
      level: "error",
      type: "runtime",
      message: event.message || "Unknown runtime error",
      stack: event.error?.stack,
      path: event.filename,
      extra: {
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  // Capture unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    logDiag({
      level: "error",
      type: "promise",
      message: reason?.message || String(reason) || "Unhandled promise rejection",
      stack: reason?.stack,
      extra: { reason },
    });
  });

  // Wrap fetch to capture network errors
  const originalFetch = window.fetch;
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const url = typeof args[0] === "string" ? args[0] : args[0].url;
    try {
      const response = await originalFetch(...args);

      // Log non-2xx responses
      if (!response.ok) {
        let errorBody: any = null;
        try {
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            errorBody = await response.clone().json();
          } else {
            errorBody = await response.clone().text();
          }
        } catch {
          // Ignore parse errors
        }

        logDiag({
          level: "warn",
          type: "network",
          message: `HTTP ${response.status}: ${url}`,
          extra: {
            status: response.status,
            statusText: response.statusText,
            url,
            body: errorBody,
          },
        });
      }

      return response;
    } catch (error: any) {
      logDiag({
        level: "error",
        type: "network",
        message: `Network error: ${url}`,
        stack: error?.stack,
        extra: {
          url,
          error: error?.message,
        },
      });
      throw error;
    }
  };

  // Wrap console.error and console.warn
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args: any[]) => {
    const message = args.map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(" ");

    logDiag({
      level: "error",
      type: "runtime",
      message,
      extra: { args },
    });

    originalError(...args);
  };

  console.warn = (...args: any[]) => {
    const message = args.map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(" ");

    logDiag({
      level: "warn",
      type: "runtime",
      message,
      extra: { args },
    });

    originalWarn(...args);
  };
}

/**
 * Log a diagnostic event
 */
export function logDiag(e: Omit<DiagEvent, "ts"> & { ts?: string }): void {
  const event: DiagEvent = {
    ts: e.ts || new Date().toISOString(),
    level: e.level,
    type: e.type,
    message: e.message,
    stack: e.stack,
    path: e.path || window.location.pathname,
    extra: e.extra,
  };

  try {
    const logs = getDiagLogs();
    logs.unshift(event);

    // Keep only last MAX_LOGS entries
    const trimmed = logs.slice(0, MAX_LOGS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    // If localStorage fails, silently ignore
    console.warn("[diagnostics] Failed to save log:", error);
  }
}

/**
 * Get all diagnostic logs
 */
export function getDiagLogs(): DiagEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DiagEvent[];
  } catch {
    return [];
  }
}

/**
 * Clear all diagnostic logs
 */
export function clearDiagLogs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently ignore
  }
}

/**
 * Get environment summary for diagnostics
 */
export function getEnvSummary() {
  return {
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    href: window.location.href,
    userAgent: navigator.userAgent,
    language: navigator.language,
    online: navigator.onLine,
    cookieEnabled: navigator.cookieEnabled,
    buildMode: import.meta.env.MODE,
    supabaseConfigured: !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY),
    netlifyContext: import.meta.env.CONTEXT || "unknown",
  };
}

/**
 * Check for WebSocket security issues
 */
export function checkWebSocketSafety(): { safe: boolean; issues: string[] } {
  const issues: string[] = [];

  if (window.location.protocol === "https:") {
    // Check if any config has insecure ws:// URLs
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    if (supabaseUrl.includes("ws://")) {
      issues.push("Supabase URL contains insecure ws:// on HTTPS site");
    }
  }

  return {
    safe: issues.length === 0,
    issues,
  };
}
