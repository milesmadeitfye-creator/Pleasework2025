/**
 * Dev Wallet Override
 *
 * Bypasses credit checks for specific test accounts in production.
 * This allows internal testing of paid features without affecting other users.
 *
 * IMPORTANT: Remove this before launching real billing to customers.
 */

/**
 * Base list of email addresses that bypass wallet/credit checks.
 * Add test accounts here for internal testing only.
 */
const BASE_DEV_EMAILS = [
  'milesdorre5@gmail.com',
];

/**
 * Get additional override emails from environment variable
 */
function getEnvOverrideEmails(): string[] {
  if (typeof window === 'undefined') return [];

  const envEmails = import.meta.env.VITE_DEV_OVERRIDE_EMAILS;
  if (!envEmails) return [];

  return envEmails
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Combined list of email addresses that bypass wallet/credit checks.
 */
export const DEV_WALLET_OVERRIDE_EMAILS = [
  ...BASE_DEV_EMAILS,
  ...getEnvOverrideEmails(),
];

/**
 * Check if a user should bypass all credit/wallet checks.
 *
 * @param user - User object with email property (from Supabase auth)
 * @returns true if user is in the dev override list
 */
export function isDevWalletOverride(user: { email?: string | null } | null | undefined): boolean {
  if (!user?.email) return false;
  const email = user.email.toLowerCase();
  return DEV_WALLET_OVERRIDE_EMAILS.includes(email);
}

/**
 * Backend version: Check if an email is in the dev override list.
 * Use this in Netlify functions where you have the email string directly.
 *
 * @param email - User's email address
 * @returns true if email is in the dev override list
 */
export function isDevWalletOverrideEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return DEV_WALLET_OVERRIDE_EMAILS.includes(email.toLowerCase());
}
