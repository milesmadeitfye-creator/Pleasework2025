/**
 * Spotify Track Resolver
 * Extracts Spotify track ID and fetches canonical metadata + ISRC
 */

import { getSpotifyAccessToken, spotifyGet } from "./spotifyClient";

export type SpotifyTrackData = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string }[];
  };
  external_ids: {
    isrc?: string;
  };
  external_urls: {
    spotify: string;
  };
  duration_ms: number;
};

/**
 * Extract Spotify track ID from various input formats
 */
export function extractSpotifyTrackId(input: string): string | null {
  if (!input) return null;

  // Direct ID: "3n3Ppam7vgaVa1iaRUc9Lp"
  if (/^[a-zA-Z0-9]{22}$/.test(input)) {
    return input;
  }

  // URI: "spotify:track:3n3Ppam7vgaVa1iaRUc9Lp"
  const uriMatch = input.match(/spotify:track:([a-zA-Z0-9]{22})/);
  if (uriMatch) return uriMatch[1];

  // URL: "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp"
  const urlMatch = input.match(/spotify\.com\/track\/([a-zA-Z0-9]{22})/);
  if (urlMatch) return urlMatch[1];

  return null;
}

/**
 * Fetch track metadata from Spotify API
 */
export async function fetchSpotifyTrack(trackId: string): Promise<SpotifyTrackData | null> {
  try {
    const token = await getSpotifyAccessToken();
    const track = await spotifyGet(`https://api.spotify.com/v1/tracks/${trackId}`, token);

    if (!track) {
      console.warn("[resolverSpotify] Track not found:", trackId);
      return null;
    }

    return {
      id: track.id,
      name: track.name,
      artists: track.artists || [],
      album: track.album || { name: "", images: [] },
      external_ids: track.external_ids || {},
      external_urls: track.external_urls || {},
      duration_ms: track.duration_ms || 0,
    };
  } catch (err: any) {
    console.error("[resolverSpotify] Fetch error:", err.message);
    return null;
  }
}

/**
 * Resolve Spotify input to canonical track data
 */
export async function resolveSpotifyTrack(input: string): Promise<{
  isrc: string | null;
  title: string;
  artist: string;
  album: string | null;
  spotify_url: string;
  spotify_track_id: string;
  cover_url: string | null;
  duration_ms: number;
} | null> {
  const trackId = extractSpotifyTrackId(input);
  if (!trackId) {
    console.warn("[resolverSpotify] Could not extract track ID from:", input);
    return null;
  }

  const track = await fetchSpotifyTrack(trackId);
  if (!track) {
    return null;
  }

  return {
    isrc: track.external_ids.isrc || null,
    title: track.name,
    artist: track.artists[0]?.name || "Unknown Artist",
    album: track.album?.name || null,
    spotify_url: track.external_urls.spotify,
    spotify_track_id: track.id,
    cover_url: track.album?.images?.[0]?.url || null,
    duration_ms: track.duration_ms,
  };
}
