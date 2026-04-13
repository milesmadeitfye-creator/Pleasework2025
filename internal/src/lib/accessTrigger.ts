const KEY = 'ghoste.internal.access';

/**
 * Stealth entry trigger.
 * Users see nothing until they hit `?access=ghoste`. Once unlocked,
 * we persist a flag in sessionStorage so deep links and auth
 * redirects don't bounce them back to the blank screen.
 */
export function accessUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('access') === 'ghoste') {
      sessionStorage.setItem(KEY, '1');
      return true;
    }
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function lockAccess() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
