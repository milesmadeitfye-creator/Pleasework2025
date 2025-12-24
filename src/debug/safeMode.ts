/**
 * Safe Mode - Bypasses data queries when enabled
 *
 * Usage:
 *   ?safe=1 in URL OR localStorage.GHOSTE_SAFE_MODE="1"
 *
 * When enabled, components should skip expensive queries
 * and render in a minimal/safe state.
 */

export function isSafeMode(): boolean {
  try {
    // Check URL parameter
    const url = new URL(window.location.href);
    if (url.searchParams.get('safe') === '1') {
      return true;
    }

    // Check localStorage
    if (localStorage.getItem('GHOSTE_SAFE_MODE') === '1') {
      return true;
    }

    return false;
  } catch (err) {
    console.error('[SafeMode] Failed to check safe mode:', err);
    return false;
  }
}

export function enableSafeMode(): void {
  try {
    localStorage.setItem('GHOSTE_SAFE_MODE', '1');
    console.log('[SafeMode] Safe mode enabled');
  } catch (err) {
    console.error('[SafeMode] Failed to enable safe mode:', err);
  }
}

export function disableSafeMode(): void {
  try {
    localStorage.removeItem('GHOSTE_SAFE_MODE');
    console.log('[SafeMode] Safe mode disabled');
  } catch (err) {
    console.error('[SafeMode] Failed to disable safe mode:', err);
  }
}

export function getSafeModeStatus(): {
  enabled: boolean;
  source: 'url' | 'localStorage' | 'disabled';
} {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('safe') === '1') {
      return { enabled: true, source: 'url' };
    }

    if (localStorage.getItem('GHOSTE_SAFE_MODE') === '1') {
      return { enabled: true, source: 'localStorage' };
    }

    return { enabled: false, source: 'disabled' };
  } catch {
    return { enabled: false, source: 'disabled' };
  }
}
