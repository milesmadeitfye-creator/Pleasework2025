/**
 * Sound URL Resolver Stubs
 * Future-proof helpers for deriving platform-native sound URLs
 */

/**
 * Resolve Facebook sound URL
 * TODO: Later - derive sound URL from post URL / media id for Facebook
 * @param input - User-provided URL or identifier
 * @returns Cleaned Facebook sound URL
 */
export function resolveFacebookSoundUrl(input: string): string {
  if (!input) return '';

  // For now, just trim and validate
  const trimmed = input.trim();

  // Basic validation: should contain facebook.com
  if (!trimmed.toLowerCase().includes('facebook.com')) {
    console.warn('[resolveFacebookSoundUrl] URL does not appear to be a Facebook link:', trimmed);
  }

  // TODO: Implement automatic sound URL derivation
  // - Parse post URL to extract post ID
  // - Query Facebook Graph API for sound/audio metadata
  // - Return canonical sound URL

  return trimmed;
}

/**
 * Resolve TikTok sound URL
 * TODO: Later - derive sound URL from post URL / media id for TikTok
 * @param input - User-provided URL or identifier
 * @returns Cleaned TikTok sound URL
 */
export function resolveTikTokSoundUrl(input: string): string {
  if (!input) return '';

  // For now, just trim and validate
  const trimmed = input.trim();

  // Basic validation: should contain tiktok.com
  if (!trimmed.toLowerCase().includes('tiktok.com')) {
    console.warn('[resolveTikTokSoundUrl] URL does not appear to be a TikTok link:', trimmed);
  }

  // TODO: Implement automatic sound URL derivation
  // - Parse video URL to extract video ID
  // - Query TikTok API for sound/music metadata
  // - Return canonical sound URL

  return trimmed;
}

/**
 * Validate sound URL format
 * @param url - URL to validate
 * @param platform - Expected platform ('facebook' | 'tiktok')
 * @returns Validation result
 */
export function validateSoundUrl(url: string, platform: 'facebook' | 'tiktok'): {
  valid: boolean;
  error?: string;
} {
  if (!url || !url.trim()) {
    return { valid: false, error: 'URL is required' };
  }

  const trimmed = url.trim();

  try {
    const urlObj = new URL(trimmed);

    if (platform === 'facebook') {
      if (!urlObj.hostname.includes('facebook.com')) {
        return { valid: false, error: 'Must be a Facebook URL' };
      }
    } else if (platform === 'tiktok') {
      if (!urlObj.hostname.includes('tiktok.com')) {
        return { valid: false, error: 'Must be a TikTok URL' };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
