/**
 * Meta Platform Event Name Standardization
 *
 * Canonical mapping from platform keys to Meta event names
 * Used across Smart Link landing pages and exit pages for consistency
 */

/**
 * Normalize platform key to standard format
 * - Lowercase
 * - Remove spaces and special characters
 * - Convert underscores and hyphens to consistent format
 */
export function normalizePlatformKey(platform: string): string {
  return platform
    .toLowerCase()
    .trim()
    .replace(/[\s\-_]+/g, '_');
}

/**
 * Get the Meta Pixel/CAPI event name for a platform click
 *
 * Supports common platform naming variations:
 * - snake_case (spotify, apple_music)
 * - camelCase (appleMusic, youtubeMusic)
 * - Title Case (Apple Music, YouTube Music)
 * - Variations (apple/appleMusic/apple_music)
 *
 * @param platform - Platform name or key
 * @returns Meta event name (e.g., "SpotifyLinkClicked")
 */
export function getPlatformClickEventName(platform: string): string {
  const normalized = normalizePlatformKey(platform);

  // Spotify
  if (normalized === 'spotify') {
    return 'SpotifyLinkClicked';
  }

  // Apple Music
  if (normalized === 'apple_music' || normalized === 'applemusic' || normalized === 'apple') {
    return 'AppleMusicLinkClicked';
  }

  // YouTube
  if (normalized === 'youtube' || normalized === 'yt') {
    return 'YouTubeLinkClicked';
  }

  // YouTube Music
  if (normalized === 'youtube_music' || normalized === 'youtubemusic' || normalized === 'ytmusic') {
    return 'YouTubeMusicLinkClicked';
  }

  // SoundCloud
  if (normalized === 'soundcloud' || normalized === 'sc') {
    return 'SoundCloudLinkClicked';
  }

  // Tidal
  if (normalized === 'tidal') {
    return 'TidalLinkClicked';
  }

  // Deezer
  if (normalized === 'deezer') {
    return 'DeezerLinkClicked';
  }

  // Amazon Music
  if (normalized === 'amazon_music' || normalized === 'amazonmusic' || normalized === 'amazon') {
    return 'AmazonMusicLinkClicked';
  }

  // Pandora
  if (normalized === 'pandora') {
    return 'PandoraLinkClicked';
  }

  // Audiomack
  if (normalized === 'audiomack') {
    return 'AudiomackLinkClicked';
  }

  // Bandcamp
  if (normalized === 'bandcamp') {
    return 'BandcampLinkClicked';
  }

  // Napster
  if (normalized === 'napster') {
    return 'NapsterLinkClicked';
  }

  // Instagram
  if (normalized === 'instagram' || normalized === 'ig') {
    return 'InstagramLinkClicked';
  }

  // TikTok
  if (normalized === 'tiktok') {
    return 'TikTokLinkClicked';
  }

  // Facebook
  if (normalized === 'facebook' || normalized === 'fb') {
    return 'FacebookLinkClicked';
  }

  // Website
  if (normalized === 'website' || normalized === 'web' || normalized === 'link') {
    return 'WebsiteLinkClicked';
  }

  // Fallback for unknown platforms
  return 'OtherLinkClicked';
}

/**
 * Get all supported platform event names
 * Useful for testing and documentation
 */
export function getAllPlatformEventNames(): string[] {
  return [
    'SpotifyLinkClicked',
    'AppleMusicLinkClicked',
    'YouTubeLinkClicked',
    'YouTubeMusicLinkClicked',
    'SoundCloudLinkClicked',
    'TidalLinkClicked',
    'DeezerLinkClicked',
    'AmazonMusicLinkClicked',
    'PandoraLinkClicked',
    'AudiomackLinkClicked',
    'BandcampLinkClicked',
    'NapsterLinkClicked',
    'InstagramLinkClicked',
    'TikTokLinkClicked',
    'FacebookLinkClicked',
    'WebsiteLinkClicked',
    'OtherLinkClicked',
  ];
}
