/**
 * Persistent Error Logger - Captures crashes to localStorage
 *
 * When app crashes, error is saved to localStorage.
 * Error boundary can then read and display it.
 */

export type GhosteCrash = {
  time: string;
  kind: 'error' | 'rejection';
  message: string;
  stack?: string;
  url?: string;
  extra?: any;
};

const KEY = '__ghoste_last_crash';

/**
 * Write crash to localStorage
 */
export function writeCrash(crash: GhosteCrash): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(crash));
    console.error('[ErrorLog] Crash written to localStorage:', crash);
  } catch (err) {
    console.error('[ErrorLog] Failed to write crash:', err);
  }
}

/**
 * Read last crash from localStorage
 */
export function readCrash(): GhosteCrash | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GhosteCrash) : null;
  } catch (err) {
    console.error('[ErrorLog] Failed to read crash:', err);
    return null;
  }
}

/**
 * Clear crash from localStorage
 */
export function clearCrash(): void {
  try {
    localStorage.removeItem(KEY);
    console.log('[ErrorLog] Crash cleared from localStorage');
  } catch (err) {
    console.error('[ErrorLog] Failed to clear crash:', err);
  }
}

/**
 * Install global crash hooks
 * Must be called as early as possible
 */
export function installCrashHooks(): void {
  console.log('[ErrorLog] Installing crash hooks...');

  // Capture synchronous JavaScript errors
  window.addEventListener('error', (event: ErrorEvent) => {
    const crash: GhosteCrash = {
      time: new Date().toISOString(),
      kind: 'error',
      message: String(event?.message || 'Unknown error'),
      stack: event?.error?.stack,
      url: window.location.href,
      extra: {
        filename: event?.filename,
        lineno: event?.lineno,
        colno: event?.colno,
      },
    };

    writeCrash(crash);
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event?.reason;
    const crash: GhosteCrash = {
      time: new Date().toISOString(),
      kind: 'rejection',
      message: String(reason?.message || reason || 'Unhandled promise rejection'),
      stack: reason?.stack,
      url: window.location.href,
    };

    writeCrash(crash);
  });

  console.log('[ErrorLog] Crash hooks installed successfully');
}

/**
 * Get human-readable crash summary
 */
export function getCrashSummary(crash: GhosteCrash | null): string {
  if (!crash) return 'No crash details available';

  const date = new Date(crash.time).toLocaleString();
  return `[${crash.kind}] ${crash.message}\nTime: ${date}\nURL: ${crash.url || 'unknown'}`;
}
