/**
 * Shared Mailchimp Configuration Helper
 *
 * Provides environment configuration and fallbacks for Mailchimp integration.
 */

export const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY || null;
export const MAILCHIMP_SERVER_PREFIX = process.env.MAILCHIMP_SERVER_PREFIX || process.env.MAILCHIMP_DEFAULT_DC || 'us13';

// Global fallback list ID for legacy flows only
// New flows should use per-user default_list_id from user_mailchimp_settings
export const MAILCHIMP_FALLBACK_LIST_ID = process.env.MAILCHIMP_LIST_ID || null;

if (!MAILCHIMP_API_KEY) {
  console.warn('[Mailchimp] MAILCHIMP_API_KEY not set (OAuth flows will still work)');
}

if (!MAILCHIMP_SERVER_PREFIX) {
  console.error('[Mailchimp] MAILCHIMP_SERVER_PREFIX not configured, using default: us13');
}

if (!MAILCHIMP_FALLBACK_LIST_ID) {
  console.warn('[Mailchimp] MAILCHIMP_FALLBACK_LIST_ID not set (per-user lists will be required)');
}
