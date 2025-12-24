import type { CoreMeta } from "./types";

/**
 * Spotify Web API Adapter
 *
 * Uses Spotify as the canonical source for track metadata:
 * - Official track title, artist names
 * - Album artwork (high quality)
 * - ISRC (International Standard Recording Code)
 * - Duration, release date
 *
 * This data is then used to find the track on other platforms via AUDD.
 */

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
    release_date: string;
  };
  duration_ms: number;
  external_ids: {
    isrc?: string;
  };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get Spotify access token using Client Credentials flow
 */
async function getSpotifyToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const clientSecret = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials not configured");
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: params,
  });

  if (!response.ok) {
    throw new Error(`Spotify token request failed: ${response.status}`);
  }

  const data: SpotifyTokenResponse = await response.json();

  // Cache token (expires in 1 hour, we'll refresh at 55 minutes)
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
  };

  return data.access_token;
}

/**
 * Extract Spotify track ID from URL
 */
export function extractSpotifyTrackId(url: string): string | null {
  const patterns = [
    /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/,
    /spotify:track:([a-zA-Z0-9]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Get track metadata from Spotify Web API
 */
export async function getSpotifyTrack(trackId: string): Promise<SpotifyTrack> {
  const token = await getSpotifyToken();

  const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Convert Spotify track to CoreMeta
 * This becomes the canonical source of truth for the track
 */
export async function spotifyToCoreMeta(trackIdOrUrl: string): Promise<CoreMeta & { spotify_url: string; cover_art_url: string }> {
  const trackId = trackIdOrUrl.includes("spotify")
    ? extractSpotifyTrackId(trackIdOrUrl)
    : trackIdOrUrl;

  if (!trackId) {
    throw new Error("Invalid Spotify URL or track ID");
  }

  const track = await getSpotifyTrack(trackId);

  return {
    isrc: track.external_ids.isrc,
    title: track.name,
    artist: track.artists.map((a) => a.name).join(", "),
    album: track.album.name,
    duration_ms: track.duration_ms,
    release_date: track.album.release_date,
    spotify_url: `https://open.spotify.com/track/${track.id}`,
    cover_art_url: track.album.images[0]?.url || "",
  };
}

/**
 * Search Spotify for a track by title + artist
 */
export async function searchSpotify(title: string, artist: string): Promise<CoreMeta & { spotify_url: string; cover_art_url: string } | null> {
  const token = await getSpotifyToken();

  const query = encodeURIComponent(`track:${title} artist:${artist}`);
  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Spotify search error: ${response.status}`);
  }

  const data = await response.json();
  const track = data.tracks?.items?.[0];

  if (!track) {
    return null;
  }

  return {
    isrc: track.external_ids.isrc,
    title: track.name,
    artist: track.artists.map((a: any) => a.name).join(", "),
    album: track.album.name,
    duration_ms: track.duration_ms,
    release_date: track.album.release_date,
    spotify_url: `https://open.spotify.com/track/${track.id}`,
    cover_art_url: track.album.images[0]?.url || "",
  };
}
