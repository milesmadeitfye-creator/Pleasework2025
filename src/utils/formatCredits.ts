/**
 * Safe credit formatting utilities
 * Prevents crashes from undefined/null/NaN values in wallet UI
 */

/**
 * Safely format credit values, handling undefined/null/NaN
 * @param value - The credit amount (can be undefined/null)
 * @param decimals - Number of decimal places (default: 0 for whole credits)
 * @returns Formatted string (e.g., "1000" or "1000.00")
 */
export function formatCredits(
  value: number | null | undefined,
  decimals: number = 0
): string {
  const n = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return n.toFixed(decimals);
}

/**
 * Safely format credit values with comma separators
 * @param value - The credit amount (can be undefined/null)
 * @returns Formatted string with commas (e.g., "1,000")
 */
export function formatCreditsWithCommas(
  value: number | null | undefined
): string {
  const n = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Safely format USD amounts from credits
 * @param value - The amount in dollars (can be undefined/null)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string (e.g., "$12.50")
 */
export function formatUSD(
  value: number | null | undefined,
  decimals: number = 2
): string {
  const n = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  return `$${n.toFixed(decimals)}`;
}
