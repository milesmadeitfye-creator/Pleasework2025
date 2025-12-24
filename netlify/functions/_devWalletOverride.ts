/**
 * Dev Wallet Override - Backend Version
 *
 * Bypasses credit checks for specific test accounts in production.
 * This allows internal testing of paid features without affecting other users.
 *
 * IMPORTANT: Remove this before launching real billing to customers.
 */

/**
 * List of email addresses that bypass wallet/credit checks.
 * Add test accounts here for internal testing only.
 */
export const DEV_WALLET_OVERRIDE_EMAILS = [
  'milesdorre5@gmail.com',
];

/**
 * Check if an email is in the dev override list.
 * Use this in Netlify functions where you have the email string directly.
 *
 * @param email - User's email address
 * @returns true if email is in the dev override list
 */
export function isDevWalletOverrideEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return DEV_WALLET_OVERRIDE_EMAILS.includes(email.toLowerCase());
}
