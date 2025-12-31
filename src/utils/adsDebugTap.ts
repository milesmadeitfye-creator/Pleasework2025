/**
 * Ads Debug Tap - Scoped Console/Network Capture
 *
 * Captures console logs, fetch calls, and errors only when on ads-related routes.
 * Stores in ring buffers with secret masking. Does not affect global app behavior.
 */

interface LogEntry {
  ts: string;
  level: 'log' | 'info' | 'warn' | 'error';
  args: any[];
}

interface NetworkEntry {
  ts: string;
  url: string;
  method: string;
  status?: number;
  ok?: boolean;
  durationMs?: number;
  requestBody?: any;
  responseBody?: any;
  error?: string;
}

interface ErrorEntry {
  ts: string;
  type: 'error' | 'rejection';
  message: string;
  stack?: string;
}

interface DebugBuffer {
  logs: LogEntry[];
  network: NetworkEntry[];
  errors: ErrorEntry[];
}

class RingBuffer<T> {
  private buffer: T[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: T) {
    this.buffer.push(item);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getAll(): T[] {
    return [...this.buffer];
  }

  clear() {
    this.buffer = [];
  }
}

// Ring buffers
const logsBuffer = new RingBuffer<LogEntry>(200);
const networkBuffer = new RingBuffer<NetworkEntry>(100);
const errorsBuffer = new RingBuffer<ErrorEntry>(50);

// Original references
let originalConsole: {
  log: typeof console.log;
  info: typeof console.info;
  warn: typeof console.warn;
  error: typeof console.error;
} | null = null;

let originalFetch: typeof window.fetch | null = null;
let errorListener: ((event: ErrorEvent) => void) | null = null;
let rejectionListener: ((event: PromiseRejectionEvent) => void) | null = null;

let isInstalled = false;

/**
 * Check if current route is ads-related
 */
function isAdsRoute(): boolean {
  const pathname = window.location.pathname;
  return (
    pathname.includes('/studio/ad-campaigns') ||
    pathname.includes('/ads') ||
    pathname.includes('/ad-')
  );
}

/**
 * Check if URL should be captured for network logs
 */
function shouldCaptureUrl(url: string): boolean {
  return (
    url.includes('/.netlify/functions/') ||
    url.includes('/graph.facebook.com') ||
    url.includes('ads') ||
    url.includes('meta')
  );
}

/**
 * Mask JWT tokens (format: x.y.z)
 */
function maskJWT(str: string): string {
  return str.replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '***masked_jwt***');
}

/**
 * Sanitize object to mask secrets
 */
function sanitizeObject(obj: any, depth = 0): any {
  if (depth > 5) return '[max depth]';

  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Mask JWTs
    if (obj.match(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)) {
      return '***masked_jwt***';
    }
    // Truncate long strings
    if (obj.length > 2000) {
      return obj.substring(0, 2000) + '... [truncated]';
    }
    return maskJWT(obj);
  }

  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }

  const sanitized: any = {};
  const secretKeys = /(token|secret|key|authorization|password|refresh|bearer|api_key|access_token)/i;

  for (const [key, value] of Object.entries(obj)) {
    if (secretKeys.test(key)) {
      sanitized[key] = '***masked***';
    } else {
      sanitized[key] = sanitizeObject(value, depth + 1);
    }
  }

  return sanitized;
}

/**
 * Sanitize arguments for logging
 */
function sanitizeArgs(args: any[]): any[] {
  return args.map(arg => sanitizeObject(arg));
}

/**
 * Hook console methods
 */
function hookConsole() {
  if (originalConsole) return; // Already hooked

  originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  const createHook = (level: 'log' | 'info' | 'warn' | 'error', original: any) => {
    return (...args: any[]) => {
      // Always call original
      original.apply(console, args);

      // Only record if on ads route
      if (isAdsRoute()) {
        logsBuffer.push({
          ts: new Date().toISOString(),
          level,
          args: sanitizeArgs(args),
        });
      }
    };
  };

  console.log = createHook('log', originalConsole.log);
  console.info = createHook('info', originalConsole.info);
  console.warn = createHook('warn', originalConsole.warn);
  console.error = createHook('error', originalConsole.error);
}

/**
 * Unhook console methods
 */
function unhookConsole() {
  if (!originalConsole) return;

  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;

  originalConsole = null;
}

/**
 * Hook fetch to capture network activity
 */
function hookFetch() {
  if (originalFetch) return; // Already hooked

  originalFetch = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || 'GET';
    const startTime = Date.now();

    let requestBody: any = undefined;
    if (init?.body) {
      try {
        if (typeof init.body === 'string') {
          requestBody = JSON.parse(init.body);
        }
      } catch {
        requestBody = '[non-json body]';
      }
    }

    try {
      const response = await originalFetch!(input, init);
      const durationMs = Date.now() - startTime;

      // Only capture if should
      if (shouldCaptureUrl(url)) {
        // Clone response to read body
        const responseClone = response.clone();
        let responseBody: any = undefined;

        try {
          const text = await responseClone.text();
          try {
            responseBody = JSON.parse(text);
          } catch {
            responseBody = text.substring(0, 500);
          }
        } catch {
          responseBody = '[read error]';
        }

        networkBuffer.push({
          ts: new Date().toISOString(),
          url,
          method,
          status: response.status,
          ok: response.ok,
          durationMs,
          requestBody: sanitizeObject(requestBody),
          responseBody: sanitizeObject(responseBody),
        });
      }

      return response;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      if (shouldCaptureUrl(url)) {
        networkBuffer.push({
          ts: new Date().toISOString(),
          url,
          method,
          durationMs,
          error: error.message || 'Network error',
          requestBody: sanitizeObject(requestBody),
        });
      }

      throw error;
    }
  };
}

/**
 * Unhook fetch
 */
function unhookFetch() {
  if (!originalFetch) return;

  window.fetch = originalFetch;
  originalFetch = null;
}

/**
 * Capture window errors
 */
function hookErrors() {
  errorListener = (event: ErrorEvent) => {
    if (isAdsRoute()) {
      errorsBuffer.push({
        ts: new Date().toISOString(),
        type: 'error',
        message: event.message,
        stack: event.error?.stack,
      });
    }
  };

  rejectionListener = (event: PromiseRejectionEvent) => {
    if (isAdsRoute()) {
      errorsBuffer.push({
        ts: new Date().toISOString(),
        type: 'rejection',
        message: String(event.reason),
        stack: event.reason?.stack,
      });
    }
  };

  window.addEventListener('error', errorListener);
  window.addEventListener('unhandledrejection', rejectionListener);
}

/**
 * Unhook error listeners
 */
function unhookErrors() {
  if (errorListener) {
    window.removeEventListener('error', errorListener);
    errorListener = null;
  }

  if (rejectionListener) {
    window.removeEventListener('unhandledrejection', rejectionListener);
    rejectionListener = null;
  }
}

/**
 * Start debug tap (idempotent)
 */
export function startAdsDebugTap(): void {
  if (isInstalled) return;

  hookConsole();
  hookFetch();
  hookErrors();

  isInstalled = true;
  console.log('[AdsDebugTap] Started');
}

/**
 * Stop debug tap
 */
export function stopAdsDebugTap(): void {
  if (!isInstalled) return;

  unhookConsole();
  unhookFetch();
  unhookErrors();

  isInstalled = false;
  console.log('[AdsDebugTap] Stopped');
}

/**
 * Get current buffer state
 */
export function getAdsDebugBuffer(): DebugBuffer {
  return {
    logs: logsBuffer.getAll(),
    network: networkBuffer.getAll(),
    errors: errorsBuffer.getAll(),
  };
}

/**
 * Clear all buffers
 */
export function clearAdsDebugBuffer(): void {
  logsBuffer.clear();
  networkBuffer.clear();
  errorsBuffer.clear();
  console.log('[AdsDebugTap] Buffers cleared');
}

/**
 * Check if tap is installed
 */
export function isAdsDebugTapActive(): boolean {
  return isInstalled;
}
