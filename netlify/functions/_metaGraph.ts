/**
 * Meta Graph API GET helper with exponential backoff
 *
 * Handles:
 * - Rate limiting (429, code 4, 17, 32)
 * - Exponential backoff with max retries
 * - Automatic retry on throttle errors
 * - Preserves error details for logging
 */

export async function metaGraphGet(url: string, accessToken: string, attempt = 0): Promise<any> {
  const u = new URL(url);
  u.searchParams.set("access_token", accessToken);

  const res = await fetch(u.toString(), { method: "GET" });
  const text = await res.text();

  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (res.ok) return json;

  const code = json?.error?.code;

  // Throttling / rate limiting patterns
  const isThrottle =
    res.status === 429 ||
    code === 4 || // app-level throttle
    code === 17 || // user request limit
    code === 32; // page request limit

  if (isThrottle && attempt < 5) {
    const waitMs = Math.min(60_000, 1000 * Math.pow(2, attempt)); // 1s,2s,4s,8s,16s,... max 60s
    console.log(`[metaGraph] Throttled, waiting ${waitMs}ms before retry ${attempt + 1}/5`);
    await new Promise((r) => setTimeout(r, waitMs));
    return metaGraphGet(url, accessToken, attempt + 1);
  }

  const err = new Error(json?.error?.message || `Meta API error ${res.status}`);
  (err as any).meta = json?.error;
  (err as any).status = res.status;
  throw err;
}
