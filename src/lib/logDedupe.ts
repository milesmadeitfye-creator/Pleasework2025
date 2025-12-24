/**
 * Error Logging Deduplication
 *
 * Prevents log spam that can cause iOS Safari memory crashes
 * Throttles repeated errors to once per time window
 */

const seen = new Map<string, number>();

/**
 * Check if a log should be output based on deduplication key
 * Returns true if enough time has passed since last log
 *
 * @param key - Unique identifier for this log type
 * @param ms - Throttle window in milliseconds (default 15s)
 */
export function shouldLog(key: string, ms: number = 15000): boolean {
  const now = Date.now();
  const last = seen.get(key) || 0;

  if (now - last < ms) {
    return false;
  }

  seen.set(key, now);
  return true;
}

/**
 * Create a deduplicated logger function
 * Usage: const warnOnce = createDedupedLogger('warn', 30000);
 *        warnOnce('network-error', 'Failed to fetch');
 */
export function createDedupedLogger(
  level: 'log' | 'warn' | 'error' | 'info' = 'warn',
  defaultMs: number = 15000
) {
  return (key: string, ...args: any[]) => {
    if (shouldLog(key, defaultMs)) {
      console[level](...args);
    }
  };
}

/**
 * Deduplicated warn logger
 * Throttles repeated warnings to once per 15s
 */
export const warnOnce = createDedupedLogger('warn', 15000);

/**
 * Deduplicated error logger
 * Throttles repeated errors to once per 30s
 */
export const errorOnce = createDedupedLogger('error', 30000);

/**
 * Deduplicated info logger
 * Throttles repeated info messages to once per 10s
 */
export const infoOnce = createDedupedLogger('info', 10000);

/**
 * Clear all deduplication state
 * Useful for testing or manual reset
 */
export function clearLogDedupe(): void {
  seen.clear();
}

/**
 * Get deduplication stats for debugging
 */
export function getLogStats(): {
  totalKeys: number;
  keys: string[];
} {
  return {
    totalKeys: seen.size,
    keys: Array.from(seen.keys()),
  };
}
