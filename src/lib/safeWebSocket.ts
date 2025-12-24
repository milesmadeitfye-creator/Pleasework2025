/**
 * Safe WebSocket Factory
 *
 * NEVER throws, returns null on failure
 * Automatically enforces wss:// on https pages
 * Disables WebSockets on iOS Safari (prevents "operation is insecure" crashes)
 */

import { isIosSafari } from "./isIosSafari";

/**
 * Create WebSocket with safety guards
 * Returns null if WebSocket unavailable or disabled
 * NEVER throws - all errors caught and logged as warnings
 */
export function createSafeWebSocket(
  url: string,
  protocols?: string | string[]
): WebSocket | null {
  try {
    // Hard-disable WebSockets on iOS Safari
    // Prevents "The operation is insecure" crash loops
    if (isIosSafari()) {
      console.warn('[WebSocket] Disabled on iOS Safari (prevents crashes)');
      return null;
    }

    // Check if WebSocket API exists
    if (typeof WebSocket === 'undefined') {
      console.warn('[WebSocket] API not available in this environment');
      return null;
    }

    // Enforce secure WebSocket on HTTPS pages
    const pageIsHttps = typeof window !== 'undefined' && window.location.protocol === "https:";
    let wsUrl = url;

    // Already ws:// or wss://
    if (wsUrl.startsWith("ws://") || wsUrl.startsWith("wss://")) {
      if (pageIsHttps && wsUrl.startsWith("ws://")) {
        wsUrl = wsUrl.replace(/^ws:\/\//, "wss://");
      }
    }
    // Convert https:// to wss://
    else if (wsUrl.startsWith("https://")) {
      wsUrl = wsUrl.replace(/^https:\/\//, "wss://");
    }
    // Convert http:// to ws:// (or wss:// if page is https)
    else if (wsUrl.startsWith("http://")) {
      wsUrl = wsUrl.replace(/^http:\/\//, "ws://");
      if (pageIsHttps) {
        wsUrl = wsUrl.replace(/^ws:\/\//, "wss://");
      }
    }
    // Treat as hostname
    else {
      wsUrl = (pageIsHttps ? "wss://" : "ws://") + wsUrl.replace(/^\/*/, "");
    }

    // Create WebSocket
    const ws = new WebSocket(wsUrl, protocols);

    // Add error handler to prevent unhandled errors
    ws.addEventListener('error', (event) => {
      console.warn('[WebSocket] Connection error (non-critical):', event);
    });

    return ws;
  } catch (err: any) {
    // Safari "operation is insecure" or other errors
    console.warn('[WebSocket] Failed to create (non-critical):', err?.message || err);
    return null;
  }
}

/**
 * Test if WebSocket is available and secure
 */
export function isWebSocketAvailable(): boolean {
  // Disabled on iOS Safari
  if (isIosSafari()) {
    return false;
  }

  // Check if API exists
  if (typeof WebSocket === 'undefined') {
    return false;
  }

  // On HTTPS, need secure WebSocket support
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    try {
      // Just check if constructor exists
      return typeof WebSocket === 'function';
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Get WebSocket status for debugging
 */
export function getWebSocketStatus(): {
  available: boolean;
  reason?: string;
} {
  if (isIosSafari()) {
    return { available: false, reason: 'Disabled on iOS Safari' };
  }

  if (typeof WebSocket === 'undefined') {
    return { available: false, reason: 'WebSocket API not available' };
  }

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  if (isHttps) {
    return { available: true, reason: 'wss:// available on https' };
  }

  return { available: true, reason: 'ws:// available on http' };
}
