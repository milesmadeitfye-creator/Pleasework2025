/**
 * Client for calling the server-side smart-links-resolve Netlify function
 *
 * This replaces direct AUDD/Spotify API calls from the frontend,
 * keeping API keys secure on the server.
 */

type PlatformLinks = {
  spotifyUrl?: string;
  appleMusicUrl?: string;
  youtubeMusicUrl?: string;
  tidalUrl?: string;
  soundcloudUrl?: string;
  deezerUrl?: string;
};

type CanonicalTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string | null;
  spotifyUrl?: string;
  isrc?: string;
  popularity?: number;
  duration_ms?: number;
};

type SmartLinkResolveResponse = {
  ok: boolean;
  reason?: string;
  canonical?: CanonicalTrack;
  platforms?: PlatformLinks;
  candidates?: CanonicalTrack[];
};

/**
 * Resolve a Smart Link from a URL (Spotify, Apple Music, YouTube, etc.)
 *
 * @param url - Full URL to a track
 * @returns Canonical track metadata + platform links
 */
export async function resolveFromUrl(url: string): Promise<SmartLinkResolveResponse> {
  const functionsOrigin =
    import.meta.env.VITE_FUNCTIONS_ORIGIN || window.location.origin;

  const response = await fetch(`${functionsOrigin}/.netlify/functions/smart-links-resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error(`Resolve request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Search for tracks by text query
 *
 * Returns candidate tracks for the user to choose from.
 *
 * @param query - Search query like "Artist - Song" or "Song Title"
 * @returns Array of candidate tracks
 */
export async function searchTracks(query: string): Promise<SmartLinkResolveResponse> {
  const functionsOrigin =
    import.meta.env.VITE_FUNCTIONS_ORIGIN || window.location.origin;

  const response = await fetch(`${functionsOrigin}/.netlify/functions/smart-links-resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Once user picks a candidate, resolve its full platform links
 *
 * @param candidate - The chosen track from search results
 * @returns Canonical track + platform links
 */
export async function resolveCandidate(candidate: CanonicalTrack): Promise<SmartLinkResolveResponse> {
  if (!candidate.spotifyUrl) {
    return {
      ok: false,
      reason: "NO_SPOTIFY_URL",
    };
  }

  return resolveFromUrl(candidate.spotifyUrl);
}
