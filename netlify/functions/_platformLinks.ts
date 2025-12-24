/**
 * Platform Links Normalizer
 * Converts ACRCloud external_metadata to validated deep links
 * ONLY accepts track-level links (no artist pages, no albums, no search)
 */

type PlatformLinks = {
  spotify?: string;
  apple_music?: string;
  youtube?: string;
  youtube_music?: string;
  deezer?: string;
  tidal?: string;
  amazon_music?: string;
  soundcloud?: string;
  kkbox?: string;
  awa?: string;
  gaana?: string;
  musicbrainz?: string;
};

/**
 * Validate that a URL is a track-level deep link
 */
function isValidTrackLink(platform: string, url: string): boolean {
  if (!url || typeof url !== "string") return false;

  const normalizedUrl = url.toLowerCase();

  switch (platform) {
    case "spotify":
      // Must include /track/
      return normalizedUrl.includes("/track/") && normalizedUrl.includes("spotify.com");

    case "applemusic":
    case "apple_music":
      // Must include ?i= (track ID) or /song/
      return (
        normalizedUrl.includes("music.apple.com") &&
        (normalizedUrl.includes("?i=") || normalizedUrl.includes("/song/"))
      );

    case "youtube":
      // Must be youtube.com/watch?v= OR music.youtube.com/watch?v=
      return (
        (normalizedUrl.includes("youtube.com/watch?v=") ||
          normalizedUrl.includes("music.youtube.com/watch?v=")) &&
        !normalizedUrl.includes("/channel/") &&
        !normalizedUrl.includes("/user/")
      );

    case "deezer":
      // Must include /track/
      return normalizedUrl.includes("deezer.com") && normalizedUrl.includes("/track/");

    case "tidal":
      // Must include /track/ or /browse/track/
      return normalizedUrl.includes("tidal.com") && normalizedUrl.includes("/track/");

    case "amazon":
    case "amazon_music":
      // Amazon Music track links
      return (
        normalizedUrl.includes("music.amazon.com") &&
        !normalizedUrl.includes("/search") &&
        !normalizedUrl.includes("/artists")
      );

    case "soundcloud":
      // Must be soundcloud.com/{artist}/{track} format
      // Reject /search, /discover, /you
      return (
        normalizedUrl.includes("soundcloud.com/") &&
        !normalizedUrl.includes("/search") &&
        !normalizedUrl.includes("/discover") &&
        !normalizedUrl.includes("/you") &&
        normalizedUrl.split("/").length >= 5
      );

    case "kkbox":
      return normalizedUrl.includes("kkbox.com") && normalizedUrl.includes("/song/");

    case "awa":
      return normalizedUrl.includes("awa.fm") && normalizedUrl.includes("/track/");

    case "gaana":
      return normalizedUrl.includes("gaana.com") && normalizedUrl.includes("/song/");

    case "musicbrainz":
      return normalizedUrl.includes("musicbrainz.org") && normalizedUrl.includes("/recording/");

    default:
      console.warn("[_platformLinks] Unknown platform:", platform);
      return false;
  }
}

/**
 * Normalize ACRCloud external_metadata to platform links
 * Priority: first link in array (if multiple)
 * Validation: only accept track-level links
 */
export function normalizeAcrLinks(
  linksByPlatform: Record<string, { url: string; id?: string }[]>
): PlatformLinks {
  const normalized: PlatformLinks = {};

  for (const [platform, items] of Object.entries(linksByPlatform)) {
    if (!Array.isArray(items) || items.length === 0) continue;

    // Take first link
    const firstItem = items[0];
    const url = firstItem.url || firstItem.link;

    if (!url) continue;

    // Validate it's a track link
    const platformKey = platform.toLowerCase();
    if (isValidTrackLink(platformKey, url)) {
      // Map platform name variants
      if (platformKey === "applemusic" || platformKey === "apple_music") {
        normalized.apple_music = url;
      } else if (platformKey === "youtube" && url.includes("music.youtube.com")) {
        // Prefer youtube_music over youtube if it's a music.youtube.com link
        normalized.youtube_music = url;
      } else if (platformKey === "amazon" || platformKey === "amazon_music") {
        normalized.amazon_music = url;
      } else {
        // Direct mapping
        normalized[platformKey as keyof PlatformLinks] = url;
      }

      console.log("[_platformLinks] ✓ Accepted:", platformKey, "→", url.slice(0, 60));
    } else {
      console.warn("[_platformLinks] ✗ Rejected (not track-level):", platformKey, "→", url.slice(0, 60));
    }
  }

  return normalized;
}

/**
 * Merge multiple PlatformLinks objects
 * Priority: first non-empty value wins
 */
export function mergePlatformLinks(...sources: (PlatformLinks | undefined)[]): PlatformLinks {
  const merged: PlatformLinks = {};

  for (const source of sources) {
    if (!source) continue;

    for (const [platform, url] of Object.entries(source)) {
      if (url && !merged[platform as keyof PlatformLinks]) {
        merged[platform as keyof PlatformLinks] = url;
      }
    }
  }

  return merged;
}

/**
 * Count how many platforms we have links for
 */
export function countPlatforms(links: PlatformLinks): number {
  return Object.values(links).filter(Boolean).length;
}

/**
 * Check if we have a "primary" platform (Spotify, Apple Music, or YouTube)
 */
export function hasPrimaryPlatform(links: PlatformLinks): boolean {
  return !!(links.spotify || links.apple_music || links.youtube || links.youtube_music);
}
