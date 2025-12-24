/**
 * Safe number utilities to prevent crashes from undefined/null/NaN values
 */

/**
 * Safely converts any value to a number, with a fallback
 * @param value - The value to convert
 * @param fallback - Default value if conversion fails (default: 0)
 * @returns A safe number value
 */
export function safeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) {
    return fallback;
  }

  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Safely format a number with toFixed, handling undefined/null values
 * @param value - The value to format
 * @param decimals - Number of decimal places (default: 2)
 * @param fallback - Fallback number if value is invalid (default: 0)
 * @returns Formatted string
 */
export function safeToFixed(value: unknown, decimals = 2, fallback = 0): string {
  return safeNumber(value, fallback).toFixed(decimals);
}

/**
 * Safely format a number as currency
 * @param value - The value to format
 * @param fallback - Fallback number if value is invalid (default: 0)
 * @returns Formatted currency string (e.g., "$12.34")
 */
export function safeCurrency(value: unknown, fallback = 0): string {
  return `$${safeToFixed(value, 2, fallback)}`;
}
