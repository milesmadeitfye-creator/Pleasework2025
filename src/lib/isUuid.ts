/**
 * Check if a string is a valid UUID (v1-v5)
 */
export function isUuid(value: string | undefined | null): boolean {
  if (!value) return false;
  // v1-v5 UUID pattern
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
