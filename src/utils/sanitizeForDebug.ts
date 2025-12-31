/**
 * Sanitize objects for debug display - mask secrets
 */

const SENSITIVE_KEY_PATTERN = /(token|secret|key|authorization|password|refresh|access_token|bearer|jwt)/i;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function maskValue(value: string): string {
  if (value.length <= 8) {
    return '***';
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function isJWT(value: string): boolean {
  return typeof value === 'string' && JWT_PATTERN.test(value);
}

export function sanitizeForDebug(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    // Check if it's a JWT-looking string
    if (typeof obj === 'string' && isJWT(obj)) {
      return maskValue(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForDebug(item));
  }

  // Plain object
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Check if key matches sensitive pattern
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      if (typeof value === 'string') {
        result[key] = maskValue(value);
      } else {
        result[key] = '***';
      }
    } else if (typeof value === 'string' && isJWT(value)) {
      // Mask JWT-looking values even if key isn't sensitive
      result[key] = maskValue(value);
    } else if (typeof value === 'object' && value !== null) {
      // Recurse
      result[key] = sanitizeForDebug(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}
