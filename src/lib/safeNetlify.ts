/**
 * Safe Netlify Function Calls
 *
 * Ensures functions never block user flow or cause "Load failed" cascades
 */

/**
 * Safe post-auth call with timeout and origin enforcement
 * Never throws, never blocks, fire-and-forget
 */
export async function safePostAuth(payload?: any) {
  if (typeof window === 'undefined') return;

  const url = `${window.location.origin}/.netlify/functions/post-auth`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
      credentials: "same-origin",
    });
  } catch {
    // Swallow all errors - post-auth is best-effort
    // No console spam on Safari/Chrome
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Safe Netlify function call with timeout
 * Returns [data, error] tuple - never throws
 */
export async function safeNetlifyCall<T = any>(
  functionName: string,
  payload?: any,
  timeoutMs: number = 10000
): Promise<[T | null, Error | null]> {
  if (typeof window === 'undefined') {
    return [null, new Error('Not in browser')];
  }

  const url = `${window.location.origin}/.netlify/functions/${functionName}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
      credentials: "same-origin",
    });

    if (!response.ok) {
      return [null, new Error(`HTTP ${response.status}`)];
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return [null, null];
    }

    const data = await response.json();
    return [data, null];
  } catch (err: any) {
    // Safari "Load failed" or timeout - don't spam
    return [null, err];
  } finally {
    clearTimeout(timeout);
  }
}
