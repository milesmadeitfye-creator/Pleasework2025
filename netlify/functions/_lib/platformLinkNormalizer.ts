/**
 * Platform Link Normalizer
 * Converts all IDs, URIs, and partial URLs into canonical platform URLs
 *
 * Handles:
 * - spotify:track:xxx → https://open.spotify.com/track/xxx
 * - Bare track IDs → Full URLs
 * - Apple Music IDs → Store ID separately (no clean URL builder)
 * - Deezer/YouTube/Tidal IDs → Full URLs where possible
 */

export type PlatformIds = {
  spotify_track_id?: string | null;
  spotify_uri?: string | null;
  apple_music_id?: string | null;
  youtube_video_id?: string | null;
  deezer_track_id?: string | null;
  tidal_track_id?: string | null;
  soundcloud_track_id?: string | null;
  isrc?: string | null;
  upc?: string | null;
};

export type NormalizedLinks = {
  spotify?: string | null;
  apple_music?: string | null;
  youtube?: string | null;
  youtube_music?: string | null;
  deezer?: string | null;
  tidal?: string | null;
  soundcloud?: string | null;
};

export type NormalizationResult = {
  normalized_links: NormalizedLinks;
  raw_ids: PlatformIds;
  notes: string[];
};

/**
 * Main normalization function
 * Takes any mix of URLs, URIs, and IDs and returns clean URLs + extracted IDs
 */
export function normalizePlatformLinks(input: {
  spotify?: string | null;
  apple_music?: string | null;
  youtube?: string | null;
  youtube_music?: string | null;
  deezer?: string | null;
  tidal?: string | null;
  soundcloud?: string | null;
  external_metadata?: any; // ACRCloud external_metadata object
}): NormalizationResult {
  const notes: string[] = [];
  const raw_ids: PlatformIds = {};
  const normalized_links: NormalizedLinks = {};

  // --- SPOTIFY ---
  if (input.spotify) {
    const spotifyResult = normalizeSpotify(input.spotify);
    if (spotifyResult.url) {
      normalized_links.spotify = spotifyResult.url;
      notes.push(spotifyResult.note);
    }
    if (spotifyResult.track_id) {
      raw_ids.spotify_track_id = spotifyResult.track_id;
    }
    if (spotifyResult.uri) {
      raw_ids.spotify_uri = spotifyResult.uri;
    }
  }

  // Extract from ACRCloud external_metadata if present
  if (input.external_metadata?.spotify) {
    const spotifyMeta = input.external_metadata.spotify;

    // Try track object first
    if (spotifyMeta.track) {
      const trackId = spotifyMeta.track.id;
      const trackUrl = spotifyMeta.track.external_urls?.spotify;

      if (trackId && !raw_ids.spotify_track_id) {
        raw_ids.spotify_track_id = trackId;
        normalized_links.spotify = `https://open.spotify.com/track/${trackId}`;
        notes.push("Spotify: Extracted track ID from ACRCloud track object");
      } else if (trackUrl && !normalized_links.spotify) {
        const extracted = normalizeSpotify(trackUrl);
        normalized_links.spotify = extracted.url;
        raw_ids.spotify_track_id = extracted.track_id;
        notes.push("Spotify: Used track URL from ACRCloud");
      }
    }

    // Try tracks array
    if (spotifyMeta.tracks && Array.isArray(spotifyMeta.tracks) && spotifyMeta.tracks.length > 0) {
      const firstTrack = spotifyMeta.tracks[0];
      if (firstTrack.id && !raw_ids.spotify_track_id) {
        raw_ids.spotify_track_id = firstTrack.id;
        normalized_links.spotify = `https://open.spotify.com/track/${firstTrack.id}`;
        notes.push("Spotify: Extracted track ID from ACRCloud tracks array");
      }
    }

    // Fallback to direct ID
    if (spotifyMeta.id && !raw_ids.spotify_track_id) {
      raw_ids.spotify_track_id = spotifyMeta.id;
      normalized_links.spotify = `https://open.spotify.com/track/${spotifyMeta.id}`;
      notes.push("Spotify: Used direct ID from ACRCloud");
    }
  }

  // --- APPLE MUSIC ---
  if (input.apple_music) {
    const appleResult = normalizeAppleMusic(input.apple_music);
    if (appleResult.url) {
      normalized_links.apple_music = appleResult.url;
      notes.push(appleResult.note);
    }
    if (appleResult.track_id) {
      raw_ids.apple_music_id = appleResult.track_id;
    }
  }

  // Extract from ACRCloud
  if (input.external_metadata?.applemusic) {
    const appleMeta = input.external_metadata.applemusic;
    if (appleMeta.url && !normalized_links.apple_music) {
      normalized_links.apple_music = appleMeta.url;
      notes.push("Apple Music: Used URL from ACRCloud");
    }
    if (appleMeta.id && !raw_ids.apple_music_id) {
      raw_ids.apple_music_id = appleMeta.id;
      // Note: Can't construct Apple Music URL from just ID (needs country + album ID)
      if (!normalized_links.apple_music) {
        notes.push("Apple Music: Stored ID but no clean URL available");
      }
    }
  }

  // --- DEEZER ---
  if (input.deezer) {
    const deezerResult = normalizeDeezer(input.deezer);
    if (deezerResult.url) {
      normalized_links.deezer = deezerResult.url;
      notes.push(deezerResult.note);
    }
    if (deezerResult.track_id) {
      raw_ids.deezer_track_id = deezerResult.track_id;
    }
  }

  // Extract from ACRCloud
  if (input.external_metadata?.deezer) {
    const deezerMeta = input.external_metadata.deezer;
    if (deezerMeta.track?.id && !normalized_links.deezer) {
      raw_ids.deezer_track_id = deezerMeta.track.id;
      normalized_links.deezer = `https://www.deezer.com/track/${deezerMeta.track.id}`;
      notes.push("Deezer: Built URL from ACRCloud track ID");
    } else if (deezerMeta.link && !normalized_links.deezer) {
      normalized_links.deezer = deezerMeta.link;
      notes.push("Deezer: Used link from ACRCloud");
    }
  }

  // --- YOUTUBE ---
  if (input.youtube) {
    const youtubeResult = normalizeYouTube(input.youtube);
    if (youtubeResult.url) {
      normalized_links.youtube = youtubeResult.url;
      notes.push(youtubeResult.note);
    }
    if (youtubeResult.video_id) {
      raw_ids.youtube_video_id = youtubeResult.video_id;
    }
  }

  // Extract from ACRCloud
  if (input.external_metadata?.youtube) {
    const youtubeMeta = input.external_metadata.youtube;
    if (youtubeMeta.vid && !normalized_links.youtube) {
      raw_ids.youtube_video_id = youtubeMeta.vid;
      normalized_links.youtube = `https://www.youtube.com/watch?v=${youtubeMeta.vid}`;
      notes.push("YouTube: Built URL from ACRCloud video ID");
    }
  }

  // --- YOUTUBE MUSIC ---
  if (input.youtube_music) {
    const ytMusicResult = normalizeYouTube(input.youtube_music);
    if (ytMusicResult.url) {
      // Convert to YouTube Music format
      if (ytMusicResult.video_id) {
        normalized_links.youtube_music = `https://music.youtube.com/watch?v=${ytMusicResult.video_id}`;
        notes.push("YouTube Music: Converted from video ID");
      } else {
        normalized_links.youtube_music = ytMusicResult.url;
        notes.push(ytMusicResult.note);
      }
    }
  }

  // --- TIDAL ---
  if (input.tidal) {
    const tidalResult = normalizeTidal(input.tidal);
    if (tidalResult.url) {
      normalized_links.tidal = tidalResult.url;
      notes.push(tidalResult.note);
    }
    if (tidalResult.track_id) {
      raw_ids.tidal_track_id = tidalResult.track_id;
    }
  }

  // --- SOUNDCLOUD ---
  if (input.soundcloud) {
    const scResult = normalizeSoundCloud(input.soundcloud);
    if (scResult.url) {
      normalized_links.soundcloud = scResult.url;
      notes.push(scResult.note);
    }
  }

  // Extract ISRC and UPC if available
  if (input.external_metadata) {
    if (input.external_metadata.isrc) {
      raw_ids.isrc = input.external_metadata.isrc;
    }
    if (input.external_metadata.upc) {
      raw_ids.upc = input.external_metadata.upc;
    }
  }

  return {
    normalized_links,
    raw_ids,
    notes,
  };
}

/**
 * Normalize Spotify: Handle URIs, IDs, and URLs
 */
function normalizeSpotify(input: string): {
  url: string | null;
  track_id: string | null;
  uri: string | null;
  note: string;
} {
  const trimmed = input.trim();

  // Case 1: spotify:track:xxx URI
  if (trimmed.startsWith("spotify:track:")) {
    const id = trimmed.split(":")[2];
    return {
      url: `https://open.spotify.com/track/${id}`,
      track_id: id,
      uri: trimmed,
      note: "Spotify: Converted URI to URL",
    };
  }

  // Case 2: Already a full URL
  if (trimmed.includes("open.spotify.com/track/")) {
    const match = trimmed.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
    const id = match?.[1] || null;
    return {
      url: trimmed,
      track_id: id,
      uri: id ? `spotify:track:${id}` : null,
      note: "Spotify: Already valid URL",
    };
  }

  // Case 3: Bare track ID (22 chars, alphanumeric)
  if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) {
    return {
      url: `https://open.spotify.com/track/${trimmed}`,
      track_id: trimmed,
      uri: `spotify:track:${trimmed}`,
      note: "Spotify: Built URL from track ID",
    };
  }

  // Case 4: Unknown format - return as-is but warn
  console.warn("[PlatformNormalizer] Unrecognized Spotify format:", trimmed);
  return {
    url: trimmed,
    track_id: null,
    uri: null,
    note: "Spotify: Unrecognized format, kept as-is",
  };
}

/**
 * Normalize Apple Music
 */
function normalizeAppleMusic(input: string): {
  url: string | null;
  track_id: string | null;
  note: string;
} {
  const trimmed = input.trim();

  // If it's already a full URL, keep it
  if (trimmed.includes("music.apple.com")) {
    const match = trimmed.match(/music\.apple\.com\/.*\/album\/.*\/(\d+)/);
    const id = match?.[1] || null;
    return {
      url: trimmed,
      track_id: id,
      note: "Apple Music: Already valid URL",
    };
  }

  // If it's just an ID, we can't build a URL (needs country + album ID)
  if (/^\d+$/.test(trimmed)) {
    return {
      url: null,
      track_id: trimmed,
      note: "Apple Music: ID only, no URL (needs country + album)",
    };
  }

  return {
    url: trimmed,
    track_id: null,
    note: "Apple Music: Unknown format, kept as-is",
  };
}

/**
 * Normalize Deezer
 */
function normalizeDeezer(input: string): {
  url: string | null;
  track_id: string | null;
  note: string;
} {
  const trimmed = input.trim();

  // If it's already a full URL, keep it
  if (trimmed.includes("deezer.com/track/")) {
    const match = trimmed.match(/deezer\.com\/track\/(\d+)/);
    const id = match?.[1] || null;
    return {
      url: trimmed,
      track_id: id,
      note: "Deezer: Already valid URL",
    };
  }

  // If it's just an ID, build URL
  if (/^\d+$/.test(trimmed)) {
    return {
      url: `https://www.deezer.com/track/${trimmed}`,
      track_id: trimmed,
      note: "Deezer: Built URL from track ID",
    };
  }

  return {
    url: trimmed,
    track_id: null,
    note: "Deezer: Unknown format, kept as-is",
  };
}

/**
 * Normalize YouTube
 */
function normalizeYouTube(input: string): {
  url: string | null;
  video_id: string | null;
  note: string;
} {
  const trimmed = input.trim();

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
    return {
      url: `https://www.youtube.com/watch?v=${videoId}`,
      video_id: videoId,
      note: "YouTube: Extracted/built video ID",
    };
  }

  return {
    url: trimmed,
    video_id: null,
    note: "YouTube: Unknown format, kept as-is",
  };
}

/**
 * Normalize Tidal
 */
function normalizeTidal(input: string): {
  url: string | null;
  track_id: string | null;
  note: string;
} {
  const trimmed = input.trim();

  // If it's already a full URL, keep it
  if (trimmed.includes("tidal.com/") || trimmed.includes("listen.tidal.com/")) {
    const match = trimmed.match(/\/track\/(\d+)/);
    const id = match?.[1] || null;
    return {
      url: trimmed,
      track_id: id,
      note: "Tidal: Already valid URL",
    };
  }

  // tidal://track/xxx deep link
  if (trimmed.startsWith("tidal://track/")) {
    const id = trimmed.split("/")[2];
    return {
      url: `https://listen.tidal.com/track/${id}`,
      track_id: id,
      note: "Tidal: Converted deep link to URL",
    };
  }

  // If it's just an ID, build URL
  if (/^\d+$/.test(trimmed)) {
    return {
      url: `https://listen.tidal.com/track/${trimmed}`,
      track_id: trimmed,
      note: "Tidal: Built URL from track ID",
    };
  }

  return {
    url: trimmed,
    track_id: null,
    note: "Tidal: Unknown format, kept as-is",
  };
}

/**
 * Normalize SoundCloud
 */
function normalizeSoundCloud(input: string): {
  url: string | null;
  note: string;
} {
  const trimmed = input.trim();

  // SoundCloud URLs are complex (artist/track), keep as-is if valid
  if (trimmed.includes("soundcloud.com/")) {
    return {
      url: trimmed,
      note: "SoundCloud: Already valid URL",
    };
  }

  return {
    url: trimmed,
    note: "SoundCloud: Unknown format, kept as-is",
  };
}

/**
 * Client-side helper: Auto-convert user input on blur/submit
 */
export function normalizeUserInput(platform: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  switch (platform) {
    case "spotify":
      return normalizeSpotify(trimmed).url || trimmed;
    case "apple_music":
      return normalizeAppleMusic(trimmed).url || trimmed;
    case "deezer":
      return normalizeDeezer(trimmed).url || trimmed;
    case "youtube":
    case "youtube_music":
      return normalizeYouTube(trimmed).url || trimmed;
    case "tidal":
      return normalizeTidal(trimmed).url || trimmed;
    case "soundcloud":
      return normalizeSoundCloud(trimmed).url || trimmed;
    default:
      return trimmed;
  }
}
