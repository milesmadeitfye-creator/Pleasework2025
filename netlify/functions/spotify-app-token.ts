import type { Handler } from "@netlify/functions";

/**
 * Spotify App Token - Client Credentials Flow
 *
 * Purpose:
 * - Obtains app-level access token for public Spotify API calls (no user auth)
 * - Used for fetching artist stats, top tracks, etc.
 * - Caches token in memory to avoid excessive token requests
 *
 * Environment Variables Required:
 * - SPOTIFY_CLIENT_ID
 * - SPOTIFY_CLIENT_SECRET
 *
 * Returns:
 * - { access_token, token_type, expires_in }
 */

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// In-memory token cache
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getAppToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    console.log("[SpotifyAppToken] Using cached token");
    return cachedToken;
  }

  console.log("[SpotifyAppToken] Fetching new token");

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
    console.error("[SpotifyAppToken] Token request failed:", response.status, error);
    throw new Error(`Failed to obtain Spotify token: ${response.status}`);
  }

  const data = await response.json();

  // Cache the token
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;

  console.log("[SpotifyAppToken] New token obtained, expires in", data.expires_in, "seconds");

  return cachedToken!;
}

export const handler: Handler = async () => {
  try {
    const token = await getAppToken();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        token_type: "Bearer",
      }),
    };
  } catch (err: any) {
    console.error("[SpotifyAppToken] Error:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err.message || "Failed to obtain Spotify app token",
      }),
    };
  }
};

// NOTE: This export is kept for reference but NOT used by other functions
// Cross-function imports break Netlify bundling - each function must be self-contained
// Other functions that need tokens should inline their own getAppToken implementation
export { getAppToken };
