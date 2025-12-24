/**
 * Safe WebSocket URL Builder
 *
 * Ensures WebSocket connections use the correct protocol:
 * - wss:// on HTTPS (production)
 * - ws:// on HTTP (localhost dev)
 *
 * This prevents "The operation is insecure" errors on iOS Safari
 * when attempting ws:// connections on HTTPS sites.
 *
 * DISABLED on iOS Safari to prevent crash loops.
 */

import { isIosSafari } from "./isIosSafari";

/**
 * Build a safe WebSocket URL from a path
 * Automatically uses wss:// on HTTPS sites
 */
export function makeWsUrl(path: string): string {
  if (typeof window === "undefined") return "";

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const p = path.startsWith("/") ? path : `/${path}`;

  return `${proto}//${host}${p}`;
}

/**
 * Create an optional WebSocket connection
 * Returns null if WebSocket is unavailable or fails to connect
 * Never throws errors - logs warnings instead
 * Disabled on iOS Safari to prevent crashes
 */
export function connectOptionalWebSocket(path: string, options?: {
  onOpen?: () => void;
  onMessage?: (event: MessageEvent) => void;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
}): WebSocket | null {
  // Hard-disable on iOS Safari
  if (isIosSafari()) {
    console.warn("[WebSocket] Disabled on iOS Safari (prevents crashes)");
    return null;
  }

  try {
    const url = makeWsUrl(path);
    if (!url) {
      console.warn("[WebSocket] URL generation failed");
      return null;
    }

    const ws = new WebSocket(url);

    if (options?.onOpen) ws.onopen = options.onOpen;
    if (options?.onMessage) ws.onmessage = options.onMessage;
    if (options?.onError) {
      ws.onerror = (event) => {
        console.warn("[WebSocket] Connection error:", event);
        options.onError?.(event);
      };
    }
    if (options?.onClose) ws.onclose = options.onClose;

    return ws;
  } catch (e) {
    console.warn("[WebSocket] Connection disabled:", e);
    return null;
  }
}
