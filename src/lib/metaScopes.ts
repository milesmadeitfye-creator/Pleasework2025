/**
 * Meta (Facebook) OAuth Scopes - Single Source of Truth
 *
 * These scopes are used across:
 * - netlify/functions/meta-auth-start.ts (backend OAuth URL)
 * - src/lib/metaOAuth.ts (frontend OAuth URL builder)
 * - netlify/functions/meta-connect-complete.ts (permission verification)
 */

export const META_REQUIRED_SCOPES = [
  // Basic info
  'public_profile',
  'email',

  // Pages permissions (for Facebook posting)
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',

  // Instagram permissions (for Instagram posting)
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',

  // Ads permissions (for ad campaigns)
  'ads_read',
  'ads_management',

  // Business permissions (for ad accounts)
  'business_management',

  // Insights (for analytics)
  'read_insights',
] as const;

export type MetaScope = typeof META_REQUIRED_SCOPES[number];

/**
 * Scopes as comma-separated string (for Meta OAuth URL)
 */
export const META_SCOPES_STRING = META_REQUIRED_SCOPES.join(',');

/**
 * Critical scopes that must be granted for core functionality
 */
export const CRITICAL_SCOPES = {
  ADS: ['ads_management', 'ads_read', 'business_management'],
  POSTING: ['pages_manage_posts', 'instagram_content_publish'],
  PAGES: ['pages_show_list', 'pages_read_engagement'],
} as const;

/**
 * Check if a scope is critical for ads functionality
 */
export function isAdsCritical(scope: string): boolean {
  return CRITICAL_SCOPES.ADS.includes(scope as any);
}

/**
 * Check if a scope is critical for posting functionality
 */
export function isPostingCritical(scope: string): boolean {
  return CRITICAL_SCOPES.POSTING.includes(scope as any);
}

/**
 * Get missing scopes from granted permissions
 */
export function getMissingScopes(grantedScopes: string[]): string[] {
  return META_REQUIRED_SCOPES.filter(
    (scope) => !grantedScopes.includes(scope)
  );
}

/**
 * Get missing critical ads scopes
 */
export function getMissingAdsScopes(grantedScopes: string[]): string[] {
  return CRITICAL_SCOPES.ADS.filter(
    (scope) => !grantedScopes.includes(scope)
  );
}

/**
 * Check if user has all required ads permissions
 */
export function hasAdsPermissions(grantedScopes: string[]): boolean {
  return CRITICAL_SCOPES.ADS.every((scope) => grantedScopes.includes(scope));
}

/**
 * Check if user has all required posting permissions
 */
export function hasPostingPermissions(grantedScopes: string[]): boolean {
  return CRITICAL_SCOPES.POSTING.every((scope) => grantedScopes.includes(scope));
}

/**
 * Get human-readable scope description
 */
export function getScopeDescription(scope: string): string {
  const descriptions: Record<string, string> = {
    public_profile: 'Basic profile information',
    email: 'Email address',
    pages_show_list: 'View pages',
    pages_read_engagement: 'Read page engagement',
    pages_manage_posts: 'Post to Facebook pages',
    pages_manage_metadata: 'Manage page settings',
    instagram_basic: 'View Instagram account',
    instagram_content_publish: 'Post to Instagram',
    instagram_manage_insights: 'View Instagram insights',
    ads_read: 'Read ad campaigns',
    ads_management: 'Create and manage ad campaigns',
    business_management: 'Access business accounts',
    read_insights: 'View analytics',
  };

  return descriptions[scope] || scope;
}
