import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

/**
 * Spotify Artist Stats
 *
 * Purpose:
 * - Fetches public Spotify artist data for dashboard
 * - Accepts artist URL or ID
 * - Stores stats in spotify_artist_stats table
 * - Returns artist info + top tracks
 *
 * Environment Variables Required:
 * - SPOTIFY_CLIENT_ID
 * - SPOTIFY_CLIENT_SECRET
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Request Body/Query:
 * - spotifyArtistUrl OR spotifyArtistId
 * - ghosteUserId
 *
 * BUILD FIX: Inlined getAppToken to avoid cross-function imports that break Netlify bundling
 */

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// In-memory token cache
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get Spotify app token using Client Credentials flow
 * Caches token to avoid excessive API calls
 */
async function getAppToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    console.log("[SpotifyStats] Using cached token");
    return cachedToken;
  }

  console.log("[SpotifyStats] Fetching new token");

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error("Spotify credentials not configured");
  }

  // Encode credentials for Basic Auth
  const credentials = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[SpotifyStats] Token request failed:", response.status, error);
    throw new Error(`Failed to obtain Spotify token: ${response.status}`);
  }

  const data = await response.json();

  // Cache the token
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;

  console.log("[SpotifyStats] New token obtained, expires in", data.expires_in, "seconds");

  return cachedToken!;
}

function extractArtistId(input: string): string | null {
  // Handle URLs like: https://open.spotify.com/artist/1234?si=xyz
  const urlMatch = input.match(/\/artist\/([a-zA-Z0-9]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Handle direct IDs (alphanumeric, 22 chars typically)
  if (/^[a-zA-Z0-9]{15,25}$/.test(input)) {
    return input;
  }

  return null;
}

export const handler: Handler = async (event) => {
  console.log("[SpotifyStats] Request received");

  try {
    // Parse request
    const body = event.body ? JSON.parse(event.body) : {};
    const params = event.queryStringParameters || {};

    const spotifyArtistUrl = body.spotifyArtistUrl || params.spotifyArtistUrl;
    const spotifyArtistId = body.spotifyArtistId || params.spotifyArtistId;
    const ghosteUserId = body.ghosteUserId || params.ghosteUserId;

    if (!ghosteUserId) {
      console.error("[SpotifyStats] Missing ghosteUserId");
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "ghosteUserId is required" }),
      };
    }

    // Extract artist ID from URL or use direct ID
    const artistInput = spotifyArtistUrl || spotifyArtistId;
    if (!artistInput) {
      console.error("[SpotifyStats] Missing artist input");
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "spotifyArtistUrl or spotifyArtistId required" }),
      };
    }

    const artistId = extractArtistId(artistInput);
    if (!artistId) {
      console.error("[SpotifyStats] Invalid artist input:", artistInput);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid Spotify artist URL or ID" }),
      };
    }

    console.log("[SpotifyStats] Artist ID extracted:", artistId);

    // Get app token
    const accessToken = await getAppToken();

    // Fetch artist data
    console.log("[SpotifyStats] Fetching artist data");
    const artistResponse = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!artistResponse.ok) {
      const error = await artistResponse.text();
      console.error("[SpotifyStats] Artist fetch failed:", artistResponse.status, error);
      return {
        statusCode: artistResponse.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to fetch artist from Spotify" }),
      };
    }

    const artistData = await artistResponse.json();

    // Fetch top tracks
    console.log("[SpotifyStats] Fetching top tracks");
    const tracksResponse = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    let topTracks = [];
    if (tracksResponse.ok) {
      const tracksData = await tracksResponse.json();
      topTracks = tracksData.tracks || [];
    }

    // Store in Supabase
    console.log("[SpotifyStats] Storing stats in Supabase");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    const { error: upsertError } = await supabase
      .from("spotify_artist_stats")
      .upsert(
        {
          user_id: ghosteUserId,
          artist_id: artistId,
          artist_name: artistData.name,
          followers: artistData.followers?.total || 0,
          popularity: artistData.popularity || 0,
          genres: artistData.genres || [],
          image_url: artistData.images?.[0]?.url || null,
          last_synced_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,artist_id",
        }
      );

    if (upsertError) {
      console.error("[SpotifyStats] Supabase upsert error:", upsertError);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to store stats", details: upsertError.message }),
      };
    }

    console.log("[SpotifyStats] Success for artist:", artistData.name);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        artist: {
          id: artistData.id,
          name: artistData.name,
          image: artistData.images?.[0]?.url || null,
          followers: artistData.followers?.total || 0,
          popularity: artistData.popularity || 0,
          genres: artistData.genres || [],
          url: artistData.external_urls?.spotify || null,
        },
        topTracks: topTracks.slice(0, 5).map((track: any) => ({
          id: track.id,
          name: track.name,
          previewUrl: track.preview_url,
          albumImage: track.album?.images?.[0]?.url || null,
          url: track.external_urls?.spotify || null,
        })),
      }),
    };
  } catch (err: any) {
    console.error("[SpotifyStats] Unexpected error:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err.message || "Internal server error",
      }),
    };
  }
};
