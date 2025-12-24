/**
 * Safe WebSocket Wrapper
 *
 * Ensures WebSocket connections are secure (wss://) on HTTPS sites
 * and provides fallback mechanisms when WebSockets are unavailable.
 * Disables WebSockets on iOS Safari to prevent crashes.
 */

import { logDiag } from "./diagnostics";
import { isIosSafari } from "./isIosSafari";

/**
 * Create a safe WebSocket URL from a path
 * Automatically uses wss:// on HTTPS sites
 */
export function makeSafeWsUrl(path: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${protocol}//${host}${safePath}`;
}

/**
 * Convert ws:// to wss:// on HTTPS sites
 */
export function safeWebSocketUrl(url: string): string {
  if (!url) return url;

  // If we're on HTTPS and URL uses ws://, upgrade to wss://
  if (window.location.protocol === "https:" && url.startsWith("ws://")) {
    const upgraded = url.replace(/^ws:\/\//, "wss://");
    logDiag({
      level: "info",
      type: "ws",
      message: `Upgraded insecure WebSocket URL to wss://`,
      extra: { original: url, upgraded },
    });
    return upgraded;
  }

  return url;
}

export interface SafeWebSocketOptions {
  onMessage?: (event: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
}

/**
 * Create a WebSocket with automatic security upgrades
 * Returns null if WebSocket creation fails
 * Disabled on iOS Safari to prevent crashes
 */
export function createSafeWebSocket(
  url: string,
  opts?: SafeWebSocketOptions
): WebSocket | null {
  // Hard-disable on iOS Safari (prevents crash loops)
  if (isIosSafari()) {
    logDiag({
      level: "info",
      type: "ws",
      message: "WebSocket disabled on iOS Safari (prevents crashes)",
      extra: { url },
    });
    return null;
  }

  const safeUrl = safeWebSocketUrl(url);

  try {
    const ws = new WebSocket(safeUrl);

    if (opts?.onMessage) {
      ws.addEventListener("message", opts.onMessage);
    }

    if (opts?.onOpen) {
      ws.addEventListener("open", opts.onOpen);
    }

    if (opts?.onClose) {
      ws.addEventListener("close", opts.onClose);
    }

    if (opts?.onError) {
      ws.addEventListener("error", opts.onError);
    }

    // Log WebSocket errors as warnings (not hard errors)
    ws.addEventListener("error", (event) => {
      logDiag({
        level: "warn",
        type: "ws",
        message: `WebSocket connection issue: ${safeUrl}`,
        extra: {
          url: safeUrl,
          originalUrl: url,
          event,
        },
      });
    });

    logDiag({
      level: "info",
      type: "ws",
      message: `WebSocket connection created: ${safeUrl}`,
      extra: { url: safeUrl, originalUrl: url },
    });

    return ws;
  } catch (error: any) {
    // Log as warning, not error (WebSocket is optional)
    logDiag({
      level: "warn",
      type: "ws",
      message: `WebSocket unavailable (expected on some browsers): ${error?.message || "Unknown error"}`,
      stack: error?.stack,
      extra: {
        originalUrl: url,
        finalUrl: safeUrl,
        protocol: window.location.protocol,
        error: error?.message,
      },
    });

    return null;
  }
}

/**
 * Check if WebSockets are supported
 * Returns false on iOS Safari (disabled to prevent crashes)
 */
export function isWebSocketSupported(): boolean {
  if (isIosSafari()) return false;
  return "WebSocket" in window;
}

/**
 * Check if current environment is secure for WebSockets
 */
export function isWebSocketSecure(): boolean {
  return window.location.protocol === "https:" || window.location.hostname === "localhost";
}

/**
 * Get WebSocket readiness status
 */
export function getWebSocketStatus() {
  const supported = isWebSocketSupported();
  const secure = isWebSocketSecure();
  const ready = supported && secure;

  return {
    supported,
    secure,
    ready,
    protocol: window.location.protocol,
    message: ready
      ? "WebSockets ready"
      : !supported
      ? "WebSockets not supported by browser"
      : "Using HTTP (WebSocket may be insecure)",
  };
}
