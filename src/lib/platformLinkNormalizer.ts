/**
 * Client-side Platform Link Normalizer
 * Auto-converts IDs, URIs, and partial URLs into canonical platform URLs
 */

/**
 * Normalize Spotify: Handle URIs, IDs, and URLs
 */
export function normalizeSpotifyUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // Case 1: spotify:track:xxx URI
  if (trimmed.startsWith("spotify:track:")) {
    const id = trimmed.split(":")[2];
    return `https://open.spotify.com/track/${id}`;
  }

  // Case 2: Already a full URL
  if (trimmed.includes("open.spotify.com/track/")) {
    return trimmed;
  }

  // Case 3: Bare track ID (22 chars, alphanumeric)
  if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) {
    return `https://open.spotify.com/track/${trimmed}`;
  }

  // Case 4: Unknown format - return as-is
  return trimmed;
}

/**
 * Normalize Apple Music
 */
export function normalizeAppleMusicUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // If it's already a full URL, keep it
  if (trimmed.includes("music.apple.com")) {
    return trimmed;
  }

  // If it's just an ID, we can't build a URL (needs country + album ID)
  // Return as-is
  return trimmed;
}

/**
 * Normalize Deezer
 */
export function normalizeDeezerUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // If it's already a full URL, keep it
  if (trimmed.includes("deezer.com/track/")) {
    return trimmed;
  }

  // If it's just an ID, build URL
  if (/^\d+$/.test(trimmed)) {
    return `https://www.deezer.com/track/${trimmed}`;
  }

  return trimmed;
}

/**
 * Normalize YouTube
 */
export function normalizeYouTubeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // Extract video ID from various YouTube URL formats
  let videoId: string | null = null;

  // youtube.com/watch?v=xxx
  if (trimmed.includes("youtube.com/watch")) {
    const match = trimmed.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    videoId = match?.[1] || null;
  }
  // youtu.be/xxx
  else if (trimmed.includes("youtu.be/")) {
    const match = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    videoId = match?.[1] || null;
  }
  // music.youtube.com/watch?v=xxx
  else if (trimmed.includes("music.youtube.com/watch")) {
    const match = trimmed.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    videoId = match?.[1] || null;
  }
  // Bare video ID (11 chars)
  else if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    videoId = trimmed;
  }

  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  return trimmed;
}

/**
 * Normalize Tidal
 */
export function normalizeTidalUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // If it's already a full URL, keep it
  if (trimmed.includes("tidal.com/") || trimmed.includes("listen.tidal.com/")) {
    return trimmed;
  }

  // tidal://track/xxx deep link
  if (trimmed.startsWith("tidal://track/")) {
    const id = trimmed.split("/")[2];
    return `https://listen.tidal.com/track/${id}`;
  }

  // If it's just an ID, build URL
  if (/^\d+$/.test(trimmed)) {
    return `https://listen.tidal.com/track/${trimmed}`;
  }

  return trimmed;
}

/**
 * Normalize SoundCloud
 */
export function normalizeSoundCloudUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // SoundCloud URLs are complex (artist/track), keep as-is if valid
  if (trimmed.includes("soundcloud.com/")) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Normalize Amazon Music
 */
export function normalizeAmazonMusicUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // Amazon Music URLs: music.amazon.com/albums/...
  if (trimmed.includes("music.amazon.com") || trimmed.includes("amazon.com/music")) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Normalize Pandora
 */
export function normalizePandoraUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // Pandora URLs: pandora.com/artist/...
  if (trimmed.includes("pandora.com")) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Normalize Bandcamp
 */
export function normalizeBandcampUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // Bandcamp URLs: artist.bandcamp.com/track/...
  if (trimmed.includes("bandcamp.com")) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Normalize Audiomack
 */
export function normalizeAudiomackUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // Audiomack URLs: audiomack.com/song/...
  if (trimmed.includes("audiomack.com")) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Generic normalizer based on platform type
 */
export function normalizePlatformUrl(platform: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  switch (platform) {
    case "spotify":
      return normalizeSpotifyUrl(trimmed);
    case "apple_music":
      return normalizeAppleMusicUrl(trimmed);
    case "deezer":
      return normalizeDeezerUrl(trimmed);
    case "youtube":
    case "youtube_music":
      return normalizeYouTubeUrl(trimmed);
    case "tidal":
      return normalizeTidalUrl(trimmed);
    case "soundcloud":
      return normalizeSoundCloudUrl(trimmed);
    case "amazon_music":
      return normalizeAmazonMusicUrl(trimmed);
    case "pandora":
      return normalizePandoraUrl(trimmed);
    case "bandcamp":
      return normalizeBandcampUrl(trimmed);
    case "audiomack":
      return normalizeAudiomackUrl(trimmed);
    default:
      return trimmed;
  }
}

/**
 * Normalize all platform URLs in a form data object
 */
export function normalizeAllPlatformUrls(formData: {
  spotify_url?: string;
  apple_music_url?: string;
  youtube_url?: string;
  youtube_music_url?: string;
  tidal_url?: string;
  soundcloud_url?: string;
  deezer_url?: string;
  amazon_music_url?: string;
  pandora_url?: string;
  bandcamp_url?: string;
  audiomack_url?: string;
}): typeof formData {
  return {
    ...formData,
    spotify_url: formData.spotify_url ? normalizeSpotifyUrl(formData.spotify_url) : formData.spotify_url,
    apple_music_url: formData.apple_music_url ? normalizeAppleMusicUrl(formData.apple_music_url) : formData.apple_music_url,
    youtube_url: formData.youtube_url ? normalizeYouTubeUrl(formData.youtube_url) : formData.youtube_url,
    youtube_music_url: formData.youtube_music_url ? normalizeYouTubeUrl(formData.youtube_music_url) : formData.youtube_music_url,
    tidal_url: formData.tidal_url ? normalizeTidalUrl(formData.tidal_url) : formData.tidal_url,
    soundcloud_url: formData.soundcloud_url ? normalizeSoundCloudUrl(formData.soundcloud_url) : formData.soundcloud_url,
    deezer_url: formData.deezer_url ? normalizeDeezerUrl(formData.deezer_url) : formData.deezer_url,
    amazon_music_url: formData.amazon_music_url ? normalizeAmazonMusicUrl(formData.amazon_music_url) : formData.amazon_music_url,
    pandora_url: formData.pandora_url ? normalizePandoraUrl(formData.pandora_url) : formData.pandora_url,
    bandcamp_url: formData.bandcamp_url ? normalizeBandcampUrl(formData.bandcamp_url) : formData.bandcamp_url,
    audiomack_url: formData.audiomack_url ? normalizeAudiomackUrl(formData.audiomack_url) : formData.audiomack_url,
  };
}
