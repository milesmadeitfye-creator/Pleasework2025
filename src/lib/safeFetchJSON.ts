/**
 * Safe Fetch Wrapper for Supabase and API calls
 *
 * Handles "TypeError: Load failed" on Safari by:
 * - Never throwing exceptions
 * - Returning default values on failure
 * - Logging warnings instead of errors
 */

/**
 * Original safeFetchJSON - now enhanced to never throw
 */
export async function safeFetchJSON(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init);
    const ct = res.headers.get("content-type") || "";

    if (!ct.includes("application/json")) {
      const text = await res.text();
      console.warn(`[SafeFetch] Expected JSON but got: ${ct}`);
      return null;
    }

    const j = await res.json();
    if (!res.ok) {
      console.warn(`[SafeFetch] Request failed (${res.status}):`, j?.error || "Unknown error");
      return null;
    }
    return j;
  } catch (err: any) {
    // Safari "Load failed" - don't spam
    console.warn('[SafeFetch] Request failed:', err?.message || err);
    return null;
  }
}

/**
 * Safe wrapper for Supabase queries
 * Returns [data, error] tuple - never throws
 */
export async function safeSupabaseQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  defaultValue: T,
  context: string = 'Query'
): Promise<[T, any]> {
  try {
    const { data, error } = await queryFn();

    if (error) {
      console.warn(`[SafeFetch] ${context} error:`, error.message);
      return [defaultValue, error];
    }

    return [data ?? defaultValue, null];
  } catch (err: any) {
    // Handle Safari "Load failed" and other network errors
    console.warn(`[SafeFetch] ${context} failed (network/timeout):`, err?.message || err);
    return [defaultValue, err];
  }
}

/**
 * Safe wrapper for RPC calls
 * Returns [data, error] tuple - never throws
 */
export async function safeSupabaseRPC<T>(
  rpcFn: () => Promise<{ data: T | null; error: any }>,
  defaultValue: T,
  context: string = 'RPC'
): Promise<[T, any]> {
  try {
    const { data, error } = await rpcFn();

    if (error) {
      console.warn(`[SafeFetch] ${context} unavailable:`, error.message);
      return [defaultValue, error];
    }

    return [data ?? defaultValue, null];
  } catch (err: any) {
    console.warn(`[SafeFetch] ${context} failed:`, err?.message || err);
    return [defaultValue, err];
  }
}

/**
 * Safe wrapper for fetch calls
 * Returns [data, error] tuple - never throws
 */
export async function safeFetch<T = any>(
  url: string,
  options?: RequestInit,
  defaultValue: T = null as T,
  context: string = 'Fetch'
): Promise<[T, Error | null]> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      console.warn(`[SafeFetch] ${context} returned ${response.status}:`, url);
      return [defaultValue, new Error(`HTTP ${response.status}`)];
    }

    // Handle empty responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return [defaultValue, null];
    }

    const data = await response.json();
    return [data, null];
  } catch (err: any) {
    // Safari "Load failed" or network errors - don't spam console
    if (err?.message?.toLowerCase().includes('load failed') ||
        err?.message?.toLowerCase().includes('network') ||
        err?.name === 'TypeError') {
      console.warn(`[SafeFetch] ${context} unavailable (expected on Safari):`, url);
    } else {
      console.warn(`[SafeFetch] ${context} error:`, err?.message || err);
    }
    return [defaultValue, err];
  }
}

/**
 * Safe wrapper for count queries
 * Returns count or 0 on failure
 */
export async function safeSupabaseCount(
  queryFn: () => Promise<{ count: number | null; error: any }>,
  context: string = 'Count'
): Promise<number> {
  try {
    const { count, error } = await queryFn();

    if (error) {
      console.warn(`[SafeFetch] ${context} error:`, error.message);
      return 0;
    }

    return count ?? 0;
  } catch (err: any) {
    console.warn(`[SafeFetch] ${context} failed:`, err?.message || err);
    return 0;
  }
}
