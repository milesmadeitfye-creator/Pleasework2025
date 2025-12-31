/**
 * Server-side sanitizer for debug logging
 * NEVER log tokens, secrets, keys, JWTs, or auth headers
 */

const SENSITIVE_KEY_PATTERN = /(token|secret|key|authorization|password|refresh|bearer|apikey|api_key|access_token|client_secret)/i;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MAX_STRING_LENGTH = 2000;

function isJWT(value: string): boolean {
  return typeof value === 'string' && JWT_PATTERN.test(value);
}

function maskValue(value: string): string {
  return '***masked***';
}

function truncateString(value: string): string {
  if (value.length > MAX_STRING_LENGTH) {
    return value.slice(0, MAX_STRING_LENGTH) + '…[truncated]';
  }
  return value;
}

export function sanitizeForDebug(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    // Mask JWT-looking strings
    if (typeof obj === 'string' && isJWT(obj)) {
      return '***masked_jwt***';
    }
    // Truncate long strings
    if (typeof obj === 'string') {
      return truncateString(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForDebug(item));
  }

  // Plain object
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Drop headers entirely (often contains auth)
    if (key.toLowerCase() === 'headers') {
      result[key] = '***headers_removed***';
      continue;
    }

    // Mask sensitive keys
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = maskValue(String(value));
    } else if (typeof value === 'string' && isJWT(value)) {
      // Mask JWT values even if key isn't sensitive
      result[key] = '***masked_jwt***';
    } else if (typeof value === 'string') {
      // Truncate long strings
      result[key] = truncateString(value);
    } else if (typeof value === 'object' && value !== null) {
      // Recurse
      result[key] = sanitizeForDebug(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Extract Meta IDs from response
 */
export function extractMetaIds(response: any): {
  meta_campaign_id?: string;
  meta_adset_id?: string;
  meta_ad_id?: string;
} {
  const ids: any = {};

  if (!response || typeof response !== 'object') {
    return ids;
  }

  // Try common response shapes
  if (response.campaign_id) ids.meta_campaign_id = String(response.campaign_id);
  if (response.campaignId) ids.meta_campaign_id = String(response.campaignId);
  if (response.meta_campaign_id) ids.meta_campaign_id = String(response.meta_campaign_id);

  if (response.adset_id) ids.meta_adset_id = String(response.adset_id);
  if (response.adsetId) ids.meta_adset_id = String(response.adsetId);
  if (response.meta_adset_id) ids.meta_adset_id = String(response.meta_adset_id);

  if (response.ad_id) ids.meta_ad_id = String(response.ad_id);
  if (response.adId) ids.meta_ad_id = String(response.adId);
  if (response.meta_ad_id) ids.meta_ad_id = String(response.meta_ad_id);

  // Check nested data object
  if (response.data) {
    const nested = extractMetaIds(response.data);
    Object.assign(ids, nested);
  }

  return ids;
}
