import type { Handler } from "@netlify/functions";

/**
 * Spotify OAuth - Start Authorization Flow
 *
 * Purpose:
 * - Initiates Spotify OAuth for fan pre-save flow or dashboard connections
 * - Redirects to Spotify authorization page
 *
 * Environment Variables Required:
 * - SPOTIFY_CLIENT_ID
 * - SPOTIFY_REDIRECT_URI
 *
 * Query Parameters:
 * - mode: "presave" or "dashboard" (default: "presave")
 * - slug: presave slug (required for mode="presave")
 * - redirectTo: optional path for mode="dashboard"
 */

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!;

export const handler: Handler = async (event) => {
  console.log("[SpotifyAuthStart] Starting OAuth flow");

  try {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REDIRECT_URI) {
      console.error("[SpotifyAuthStart] Missing credentials");
      return {
        statusCode: 302,
        headers: {
          Location: "https://ghoste.one/dashboard?spotify=error&reason=server_config",
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    const params = event.queryStringParameters || {};
    const mode = params.mode || "presave";
    const slug = params.slug || "";
    const redirectTo = params.redirectTo || "/dashboard";
    const email = params.email || "";
    const forever_save = params.forever_save !== "false"; // Default true

    console.log("[SpotifyAuthStart] Mode:", mode, "Slug:", slug, "Forever Save:", forever_save);

    // Validate presave mode has slug
    if (mode === "presave" && !slug) {
      console.error("[SpotifyAuthStart] Missing slug for presave mode");
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "slug required for presave mode" }),
      };
    }

    // Build state
    const stateObj: any = {
      mode,
      slug,
      redirectTo,
      timestamp: Date.now(),
    };

    // Add presave-specific fields to state
    if (mode === "presave") {
      stateObj.email = email;
      stateObj.forever_save = forever_save;
    }

    const state = encodeURIComponent(JSON.stringify(stateObj));

    // Build authorization URL
    const authUrl = new URL("https://accounts.spotify.com/authorize");
    authUrl.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", SPOTIFY_REDIRECT_URI);
    authUrl.searchParams.set("state", state);

    // Set scopes based on mode
    const scopes =
      mode === "presave"
        ? ["user-read-email", "user-read-private", "user-library-read", "user-library-modify"]
        : ["user-read-email", "user-read-private"];

    authUrl.searchParams.set("scope", scopes.join(" "));

    console.log("[SpotifyAuthStart] Redirecting to Spotify authorization");

    return {
      statusCode: 302,
      headers: {
        Location: authUrl.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
      body: "",
    };
  } catch (err: any) {
    console.error("[SpotifyAuthStart] Unexpected error:", err);

    return {
      statusCode: 302,
      headers: {
        Location: "https://ghoste.one/dashboard?spotify=error&reason=server_error",
        "Cache-Control": "no-cache",
      },
      body: "",
    };
  }
};
