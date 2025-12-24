/**
 * Fetch Guard - Prevents request spam and resource exhaustion
 *
 * Features:
 * - Single-flight: Only one request per key can run at a time
 * - Abort support: Cancel previous requests when new ones start
 * - Retry limit: Max 2 retries per request
 * - Debounce: Optional delay before executing
 * - Memory cleanup: Auto-removes old requests
 */

interface PendingRequest {
  promise: Promise<any>;
  controller: AbortController;
  timestamp: number;
}

const pendingRequests = new Map<string, PendingRequest>();
const requestCounts = new Map<string, number>();
const MAX_RETRIES = 2;
const CLEANUP_INTERVAL = 60000; // 1 minute
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Clean up old requests periodically
setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];

  pendingRequests.forEach((request, key) => {
    if (now - request.timestamp > REQUEST_TIMEOUT) {
      request.controller.abort();
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => {
    pendingRequests.delete(key);
    requestCounts.delete(key);
  });
}, CLEANUP_INTERVAL);

/**
 * Single-flight fetch: Only allows one request per key at a time
 * If a request is already in flight, returns that promise
 */
export async function singleFlight<T>(
  key: string,
  fn: (signal: AbortSignal) => Promise<T>,
  options: {
    debounce?: number;
    forceRefresh?: boolean;
  } = {}
): Promise<T> {
  const { debounce = 0, forceRefresh = false } = options;

  // If request is already in flight and not forcing refresh, return existing promise
  if (!forceRefresh && pendingRequests.has(key)) {
    // Silently return existing promise (no log spam)
    return pendingRequests.get(key)!.promise;
  }

  // Cancel any existing request for this key
  if (pendingRequests.has(key)) {
    const existing = pendingRequests.get(key)!;
    existing.controller.abort();
    pendingRequests.delete(key);
  }

  // Check retry count
  const retryCount = requestCounts.get(key) || 0;
  if (retryCount >= MAX_RETRIES) {
    console.error(`[fetchGuard] Max retries (${MAX_RETRIES}) exceeded for key: ${key}`);
    requestCounts.delete(key);
    throw new Error(`Max retries exceeded for ${key}`);
  }

  // Debounce if requested
  if (debounce > 0) {
    await new Promise(resolve => setTimeout(resolve, debounce));
  }

  // Create new abort controller
  const controller = new AbortController();

  // Execute request
  const promise = (async () => {
    try {
      const result = await fn(controller.signal);

      // Success - clear retry count
      requestCounts.delete(key);
      pendingRequests.delete(key);

      return result;
    } catch (error: any) {
      // Clean up
      pendingRequests.delete(key);

      // Don't count aborts as retries (silently)
      if (error.name === 'AbortError') {
        throw error;
      }

      // Increment retry count
      const newCount = (requestCounts.get(key) || 0) + 1;
      requestCounts.set(key, newCount);

      console.error(`[fetchGuard] Request failed for key: ${key} (attempt ${newCount}/${MAX_RETRIES}):`, error);

      throw error;
    }
  })();

  // Store pending request
  pendingRequests.set(key, {
    promise,
    controller,
    timestamp: Date.now(),
  });

  return promise;
}

/**
 * Debounced function executor
 * Delays execution until after specified wait time has elapsed since last call
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      fn(...args);
    }, wait);
  };
}

/**
 * Check if a request is currently in flight
 */
export function isRequestPending(key: string): boolean {
  return pendingRequests.has(key);
}

/**
 * Cancel a specific request
 */
export function cancelRequest(key: string): void {
  const request = pendingRequests.get(key);
  if (request) {
    request.controller.abort();
    pendingRequests.delete(key);
    console.log(`[fetchGuard] Cancelled request for key: ${key}`);
  }
}

/**
 * Cancel all pending requests
 */
export function cancelAllRequests(): void {
  pendingRequests.forEach((request, key) => {
    request.controller.abort();
    console.log(`[fetchGuard] Cancelled request for key: ${key}`);
  });
  pendingRequests.clear();
  requestCounts.clear();
}

/**
 * Get stats about current requests
 */
export function getRequestStats() {
  return {
    pending: pendingRequests.size,
    retrying: requestCounts.size,
    keys: Array.from(pendingRequests.keys()),
  };
}

/**
 * Batch multiple requests with single-flight protection
 * Executes all requests in parallel but ensures no duplicates
 */
export async function batchSingleFlight<T extends Record<string, () => Promise<any>>>(
  requests: T
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const entries = Object.entries(requests);

  const results = await Promise.all(
    entries.map(async ([key, fn]) => {
      const result = await singleFlight(key, async (signal) => {
        // Pass a dummy signal since the original fn doesn't expect it
        return fn();
      });
      return [key, result];
    })
  );

  return Object.fromEntries(results) as any;
}
