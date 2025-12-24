/**
 * WebSocket URL Safety
 *
 * Prevents "The operation is insecure" error on iOS Safari
 * by enforcing wss:// on https:// pages
 */

/**
 * Convert any URL to a safe WebSocket URL
 * Enforces wss:// on https pages, ws:// on http pages
 */
export function toSafeWebSocketUrl(input: string): string {
  if (!input) return '';

  // Check if page is HTTPS
  const pageIsHttps = typeof window !== 'undefined' && window.location.protocol === "https:";

  // If already ws(s), keep but enforce wss on https pages
  if (input.startsWith("ws://") || input.startsWith("wss://")) {
    if (pageIsHttps && input.startsWith("ws://")) {
      return input.replace(/^ws:\/\//, "wss://");
    }
    return input;
  }

  // Convert http(s) URLs to ws(s)
  if (input.startsWith("https://")) {
    return input.replace(/^https:\/\//, "wss://");
  }
  if (input.startsWith("http://")) {
    return input.replace(/^http:\/\//, "ws://");
  }

  // Fallback: treat as host
  return (pageIsHttps ? "wss://" : "ws://") + input.replace(/^\/*/, "");
}

/**
 * Create WebSocket with safety wrapper
 * Never throws, logs warnings instead of errors
 */
export function createSafeWebSocket(
  url: string,
  protocols?: string | string[]
): WebSocket | null {
  try {
    const safeUrl = toSafeWebSocketUrl(url);

    if (!safeUrl) {
      console.warn('[WebSocket] Invalid URL provided');
      return null;
    }

    const ws = new WebSocket(safeUrl, protocols);

    // Set up error handler to prevent unhandled errors
    ws.addEventListener('error', (event) => {
      console.warn('[WebSocket] Connection error (non-critical):', event);
    });

    return ws;
  } catch (err: any) {
    // Safari "operation is insecure" or other errors
    console.warn('[WebSocket] Failed to create socket (non-critical):', err?.message || err);
    return null;
  }
}

/**
 * Test if WebSocket is available and secure
 */
export function isWebSocketAvailable(): boolean {
  if (typeof WebSocket === 'undefined') {
    return false;
  }

  // Check if page is HTTPS and WebSocket secure is required
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    // On HTTPS, we need secure WebSocket support
    try {
      // Just check if constructor exists, don't actually connect
      return typeof WebSocket === 'function';
    } catch {
      return false;
    }
  }

  return true;
}
