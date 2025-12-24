export type Platform =
  | "spotify"
  | "apple_music"
  | "youtube"
  | "tidal"
  | "soundcloud"
  | "deezer"
  | "audiomack";

export interface PlatformUrls {
  spotify_url?: string | null;
  apple_music_url?: string | null;
  youtube_url?: string | null;
  tidal_url?: string | null;
  soundcloud_url?: string | null;
  deezer_url?: string | null;
  audiomack_url?: string | null;
}

export interface OneClickLinkRow {
  spotify_url?: string | null;
  apple_music_url?: string | null;
  youtube_url?: string | null;
  tidal_url?: string | null;
  soundcloud_url?: string | null;
  deezer_url?: string | null;
  audiomack_url?: string | null;
  target_url?: string | null;
}

export function normalizePlatformUrl(platform: Platform, raw: string): string {
  if (!raw) return "";

  const url = raw.trim();

  if (url.startsWith("spotify:track:")) {
    const id = url.split("spotify:track:")[1]?.split("?")[0];
    if (id) return `https://open.spotify.com/track/${id}`;
  }

  if (url.startsWith("spotify:album:")) {
    const id = url.split("spotify:album:")[1]?.split("?")[0];
    if (id) return `https://open.spotify.com/album/${id}`;
  }

  if (platform === "spotify" && url.includes("open.spotify.com")) {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  if (platform === "apple_music" && url.includes("music.apple.com")) {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  if (platform === "youtube") {
    if (url.startsWith("youtu.be/")) {
      const id = url.split("youtu.be/")[1]?.split("?")[0];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    if (url.includes("youtu.be/")) {
      const id = url.split("youtu.be/")[1]?.split("?")[0];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    if (url.includes("youtube.com/watch")) {
      try {
        const parsed = new URL(url);
        const videoId = parsed.searchParams.get("v");
        if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
      } catch {
        return url;
      }
    }
  }

  if (platform === "tidal" && url.includes("tidal.com")) {
    try {
      const parsed = new URL(url);
      if (parsed.pathname.includes("/track/")) {
        const parts = parsed.pathname.split("/").filter(Boolean);
        const trackIndex = parts.indexOf("track");
        if (trackIndex >= 0 && parts[trackIndex + 1]) {
          const id = parts[trackIndex + 1];
          return `https://tidal.com/browse/track/${id}`;
        }
      }
      return url.split("?")[0];
    } catch {
      return url.split("?")[0];
    }
  }

  if (platform === "soundcloud" && url.includes("soundcloud.com")) {
    return url.split("?")[0];
  }

  if (platform === "deezer" && url.includes("deezer.com")) {
    return url.split("?")[0];
  }

  if (platform === "audiomack" && url.includes("audiomack.com")) {
    return url.split("?")[0];
  }

  if (url.startsWith("https://") || url.startsWith("http://")) {
    return url;
  }

  return url;
}

export function extractTrackId(platform: Platform, url: string): string | null {
  if (!url) return null;

  try {
    if (platform === "spotify") {
      if (url.includes("spotify:track:")) {
        return url.split("spotify:track:")[1]?.split("?")[0] || null;
      }
      if (url.includes("open.spotify.com/track/")) {
        const parts = url.split("open.spotify.com/track/")[1];
        return parts?.split("?")[0]?.split("/")[0] || null;
      }
    }

    if (platform === "apple_music") {
      const match = url.match(/\/i=(\d+)/);
      return match ? match[1] : null;
    }

    if (platform === "youtube") {
      const parsed = new URL(url);
      return parsed.searchParams.get("v");
    }

    if (platform === "tidal") {
      const match = url.match(/\/(?:track|browse\/track)\/(\d+)/);
      return match ? match[1] : null;
    }

    if (platform === "deezer") {
      const match = url.match(/\/track\/(\d+)/);
      return match ? match[1] : null;
    }

    if (platform === "soundcloud") {
      return url;
    }

    if (platform === "audiomack") {
      return url;
    }
  } catch (e) {
    console.error("Error extracting track ID:", e);
  }

  return null;
}

export function detectPlatformFromUrl(url: string): Platform | null {
  if (!url) return null;

  const lower = url.toLowerCase();

  if (lower.includes("spotify.com") || lower.includes("spotify:")) return "spotify";
  if (lower.includes("music.apple.com")) return "apple_music";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("tidal.com")) return "tidal";
  if (lower.includes("soundcloud.com")) return "soundcloud";
  if (lower.includes("deezer.com")) return "deezer";
  if (lower.includes("audiomack.com")) return "audiomack";

  return null;
}

export function isMobile(ua: string): boolean {
  const lower = ua.toLowerCase();
  return /iphone|ipad|ipod|android/.test(lower);
}

export function buildDeepLink(
  platform: Platform,
  url: string,
  userAgent: string
): string {
  if (!url) return "";

  const mobile = isMobile(userAgent);
  const isIOS = /iphone|ipad|ipod/i.test(userAgent.toLowerCase());
  const isAndroid = /android/i.test(userAgent.toLowerCase());

  switch (platform) {
    case "spotify": {
      if (mobile) {
        const trackId = extractTrackId("spotify", url);
        if (trackId) {
          return `spotify://track/${trackId}`;
        }
      }
      return url;
    }

    case "apple_music": {
      return url;
    }

    case "youtube": {
      return url;
    }

    case "tidal": {
      return url;
    }

    case "soundcloud": {
      return url;
    }

    case "deezer": {
      return url;
    }

    case "audiomack": {
      return url;
    }

    default:
      return url;
  }
}

export function buildDeepLinkFromRow(
  platform: Platform,
  row: OneClickLinkRow,
  ua: string
): string | null {
  const mobile = isMobile(ua);

  switch (platform) {
    case "spotify": {
      const url = row.spotify_url;
      if (!url) return null;
      return buildDeepLink("spotify", url, ua);
    }

    case "apple_music": {
      const url = row.apple_music_url;
      if (!url) return null;
      return url;
    }

    case "youtube": {
      const url = row.youtube_url;
      if (!url) return null;
      return url;
    }

    case "tidal": {
      const url = row.tidal_url;
      if (!url) return null;
      return url;
    }

    case "soundcloud": {
      const url = row.soundcloud_url;
      if (!url) return null;
      return url;
    }

    case "deezer": {
      const url = row.deezer_url;
      if (!url) return null;
      return url;
    }

    case "audiomack": {
      const url = row.audiomack_url;
      if (!url) return null;
      return url;
    }

    default:
      return null;
  }
}

export function normalizeAllPlatformUrls(urls: PlatformUrls): PlatformUrls {
  return {
    spotify_url: urls.spotify_url ? normalizePlatformUrl("spotify", urls.spotify_url) : null,
    apple_music_url: urls.apple_music_url ? normalizePlatformUrl("apple_music", urls.apple_music_url) : null,
    youtube_url: urls.youtube_url ? normalizePlatformUrl("youtube", urls.youtube_url) : null,
    tidal_url: urls.tidal_url ? normalizePlatformUrl("tidal", urls.tidal_url) : null,
    soundcloud_url: urls.soundcloud_url ? normalizePlatformUrl("soundcloud", urls.soundcloud_url) : null,
    deezer_url: urls.deezer_url ? normalizePlatformUrl("deezer", urls.deezer_url) : null,
    audiomack_url: urls.audiomack_url ? normalizePlatformUrl("audiomack", urls.audiomack_url) : null,
  };
}
