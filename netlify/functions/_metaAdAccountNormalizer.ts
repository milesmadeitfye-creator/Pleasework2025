/**
 * Normalizes Meta ad account IDs to prevent act_act_ bug
 *
 * Meta API sometimes returns act_12345 or 12345
 * We always store as act_12345 (single prefix)
 */
export function normalizeAdAccountId(raw?: string | null): string | null {
  if (!raw) return null;

  const s = String(raw).trim();
  if (!s) return null;

  // Remove all act_ prefixes (handles act_act_act_...)
  const cleaned = s.replace(/^(act_)+/g, '');

  // Re-add single act_ prefix
  return `act_${cleaned}`;
}

/**
 * Extract numeric part of ad account ID
 */
export function getAdAccountNumericId(raw?: string | null): string | null {
  if (!raw) return null;

  const s = String(raw).trim();
  const cleaned = s.replace(/^(act_)+/g, '');

  return cleaned || null;
}
