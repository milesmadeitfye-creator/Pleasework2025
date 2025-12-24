/**
 * Feature flags for Ghoste One
 *
 * These control which features are enabled/disabled in the application.
 */

export const FEATURES = {
  /**
   * Sora AI Video Generation
   * DEPRECATED: Replaced by Music Visuals vault-based loop engine
   * Legacy AI video generation is disabled
   */
  SORA_ENABLED: false,

  /**
   * Meta Ads Integration
   */
  META_ADS_ENABLED: true,

  /**
   * TikTok Ads Integration
   */
  TIKTOK_ADS_ENABLED: true,
} as const;

/**
 * Check if Sora video generation is enabled
 */
export function isSoraEnabled(): boolean {
  // Check environment variable first (for future use)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const envValue = import.meta.env.VITE_SORA_ENABLED;
    if (envValue === 'true') return true;
    if (envValue === 'false') return false;
  }

  // Fall back to config
  return FEATURES.SORA_ENABLED;
}

/**
 * Check if Meta Ads are enabled
 */
export function isMetaAdsEnabled(): boolean {
  return FEATURES.META_ADS_ENABLED;
}

/**
 * Check if TikTok Ads are enabled
 */
export function isTikTokAdsEnabled(): boolean {
  return FEATURES.TIKTOK_ADS_ENABLED;
}
