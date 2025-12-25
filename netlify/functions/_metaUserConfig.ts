import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export interface UserMetaConfig {
  accessToken: string;
  businessId: string;
  pageId: string;
  instagramId: string;
  adAccountId: string;
  pixelId?: string;
  metaUserId: string;
  businessName?: string;
  pageName?: string;
  instagramUsername?: string;
  adAccountName?: string;
}

export class MetaConfigError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'MetaConfigError';
  }
}

/**
 * Gets the complete Meta configuration for a user by checking meta_credentials.
 * Uses configuration_complete flag as the primary gate.
 *
 * @throws MetaConfigError if connection or assets are missing/incomplete
 */
export async function getUserMetaConfig(userId: string): Promise<UserMetaConfig> {
  // 1. Check meta_credentials table (primary source of truth)
  const { data: metaCreds, error: credsError } = await supabase
    .from('meta_credentials')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (credsError) {
    console.error('[getUserMetaConfig] Credentials query error:', credsError);
    throw new MetaConfigError('DATABASE_ERROR', 'Failed to query Meta credentials');
  }

  if (!metaCreds) {
    throw new MetaConfigError(
      'META_NOT_CONFIGURED',
      'Meta account is not fully configured. Please complete setup in your Profile settings.'
    );
  }

  // 2. Check if configuration has MINIMAL requirements (access token + ad account)
  // This allows AI to work with connected accounts even if setup isn't 100% complete
  const hasAccessToken = !!metaCreds.access_token;
  const hasAdAccount = !!metaCreds.ad_account_id;

  // Minimal config: just need access token and ad account to run ads
  const minimalConfigReady = hasAccessToken && hasAdAccount;

  // Full config: all assets selected (optional for AI context, required for some operations)
  const hasBusiness = !!metaCreds.business_id;
  const hasProfile = !!metaCreds.profile_id;
  const hasPage = !!metaCreds.page_id;
  const hasInstagram = !!metaCreds.instagram_id;
  const hasPixel = !!metaCreds.pixel_id;

  const fullConfigComplete =
    minimalConfigReady &&
    hasBusiness &&
    hasProfile &&
    hasPage &&
    hasInstagram &&
    hasPixel;

  // Accept either: explicit flag OR minimal requirements met
  const metaConfigured = !!metaCreds.configuration_complete || minimalConfigReady;

  if (!metaConfigured) {
    const missingFields: string[] = [];
    if (!hasAccessToken) missingFields.push('access_token');
    if (!hasAdAccount) missingFields.push('ad_account');

    console.warn('[getUserMetaConfig] Meta not configured (minimal check):', {
      userId,
      hasAccessToken: !!hasAccessToken,
      hasAdAccount,
      configurationComplete: metaCreds.configuration_complete,
    });

    throw new MetaConfigError(
      'META_NOT_CONFIGURED',
      `Meta account is not fully configured. Missing: ${missingFields.join(', ')}. Please complete setup in your Profile settings.`
    );
  }

  // Log warnings for missing optional fields (but don't block)
  if (!fullConfigComplete) {
    const optionalMissing: string[] = [];
    if (!hasBusiness) optionalMissing.push('business');
    if (!hasProfile) optionalMissing.push('profile');
    if (!hasPage) optionalMissing.push('page');
    if (!hasInstagram) optionalMissing.push('instagram');
    if (!hasPixel) optionalMissing.push('pixel');

    console.log('[getUserMetaConfig] Meta connected (minimal), but missing optional assets:', optionalMissing.join(', '));
  }

  // 3. Return complete config
  return {
    accessToken: metaCreds.access_token,
    businessId: metaCreds.business_id,
    pageId: metaCreds.page_id,
    instagramId: metaCreds.instagram_id,
    adAccountId: metaCreds.ad_account_id,
    pixelId: metaCreds.pixel_id || undefined,
    metaUserId: metaCreds.meta_user_id || '',
    businessName: metaCreds.business_name,
    pageName: metaCreds.page_name,
    instagramUsername: metaCreds.instagram_username,
    adAccountName: metaCreds.ad_account_name,
  };
}

/**
 * Checks if user has a Meta connection (without throwing errors)
 */
export async function hasMetaConnection(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('meta_credentials')
    .select('id, access_token')
    .eq('user_id', userId)
    .maybeSingle();

  return !!data?.access_token;
}

/**
 * Checks if user has completed Meta asset configuration
 */
export async function hasMetaAssets(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('meta_credentials')
    .select('ad_account_id, page_id, configuration_complete')
    .eq('user_id', userId)
    .maybeSingle();

  // Simplified: ad_account and page are required (business/profile optional)
  return !!(
    data?.ad_account_id &&
    data?.page_id
  );
}
