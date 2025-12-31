/**
 * Debug utilities for in-app debugging of API calls and responses
 *
 * Features:
 * - Sanitizes sensitive data (tokens, secrets, keys, JWTs)
 * - Detects debug mode via URL params (?debug=ads or ?debug=1) or dev environment
 * - Provides clipboard copy functionality
 *
 * Usage:
 * - In dev: Debug panel always visible
 * - In prod: Add ?debug=ads to URL to enable debug panel
 *
 * @example
 * const payload = { token: 'secret', data: 'value' };
 * const sanitized = sanitizeForDebug(payload);
 * // Result: { token: '***masked***', data: 'value' }
 */

const SENSITIVE_KEYS = /(token|secret|key|authorization|password|refresh|bearer|jwt|api_key|access_token|refresh_token|service_role|anon_key)/i;

const isJWT = (value: string): boolean => {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  return parts.length === 3 && parts.every(part => part.length > 10);
};

const maskUrlParams = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const maskedParams = new URLSearchParams();

    params.forEach((value, key) => {
      if (SENSITIVE_KEYS.test(key) || isJWT(value)) {
        maskedParams.set(key, '***masked***');
      } else {
        maskedParams.set(key, value);
      }
    });

    urlObj.search = maskedParams.toString();
    return urlObj.toString();
  } catch {
    return url;
  }
};

export const sanitizeForDebug = (data: any, depth = 0): any => {
  if (depth > 10) return '[max depth]';
  if (data === null || data === undefined) return data;

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForDebug(item, depth + 1));
  }

  // Handle objects
  if (typeof data === 'object') {
    const sanitized: any = {};

    for (const [key, value] of Object.entries(data)) {
      // Check if key contains sensitive words
      if (SENSITIVE_KEYS.test(key)) {
        sanitized[key] = '***masked***';
        continue;
      }

      // Check if value is a JWT
      if (typeof value === 'string' && isJWT(value)) {
        sanitized[key] = '***masked_jwt***';
        continue;
      }

      // Check if value is a URL with sensitive params
      if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) {
        sanitized[key] = maskUrlParams(value);
        continue;
      }

      // Recursively sanitize nested objects/arrays
      sanitized[key] = sanitizeForDebug(value, depth + 1);
    }

    return sanitized;
  }

  // Primitive values - return as-is
  return data;
};

export const isDebugEnabled = (): boolean => {
  // Always enabled in dev
  if (import.meta.env.DEV) return true;

  // Check URL params
  const params = new URLSearchParams(window.location.search);
  const debugParam = params.get('debug');

  return debugParam === 'ads' || debugParam === '1' || debugParam === 'true';
};

export const copyToClipboard = async (data: any): Promise<boolean> => {
  try {
    const sanitized = sanitizeForDebug(data);
    const text = JSON.stringify(sanitized, null, 2);
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
};
