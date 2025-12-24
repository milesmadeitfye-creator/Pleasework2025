import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

/**
 * Spotify OAuth - Callback Handler
 *
 * Purpose:
 * - Receives authorization code from Spotify after user approves
 * - Exchanges code for access token
 * - Fetches user profile from Spotify
 * - For presave mode: logs pre-save event in spotify_presaves table
 * - For dashboard mode: could store tokens for future use
 * - Redirects back to appropriate page with success/error status
 *
 * Environment Variables Required:
 * - SPOTIFY_CLIENT_ID
 * - SPOTIFY_CLIENT_SECRET
 * - SPOTIFY_REDIRECT_URI
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FRONTEND_BASE = "https://ghoste.one";

export const handler: Handler = async (event) => {
  console.log("[SpotifyAuthCallback] Callback received");

  try {
    // Validate environment variables
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) {
      console.error("[SpotifyAuthCallback] Missing credentials");
      return {
        statusCode: 302,
        headers: {
          Location: `${FRONTEND_BASE}/dashboard?spotify=error&reason=server_config`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    const params = event.queryStringParameters || {};
    const code = params.code;
    const stateParam = params.state;
    const error = params.error;

    // Check for OAuth errors from Spotify
    if (error) {
      console.warn("[SpotifyAuthCallback] OAuth error from Spotify:", error);
      return {
        statusCode: 302,
        headers: {
          Location: `${FRONTEND_BASE}/dashboard?spotify=error&reason=${encodeURIComponent(error)}`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    if (!code) {
      console.error("[SpotifyAuthCallback] Missing authorization code");
      return {
        statusCode: 302,
        headers: {
          Location: `${FRONTEND_BASE}/dashboard?spotify=error&reason=missing_code`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    // Decode state
    let mode = "presave";
    let slug = "";
    let redirectTo = "/dashboard";

    if (stateParam) {
      try {
        const state = JSON.parse(decodeURIComponent(stateParam));
        mode = state.mode || "presave";
        slug = state.slug || "";
        redirectTo = state.redirectTo || "/dashboard";
      } catch (err) {
        console.warn("[SpotifyAuthCallback] Failed to parse state:", err);
      }
    }

    console.log("[SpotifyAuthCallback] Mode:", mode, "Slug:", slug);

    // Exchange code for access token
    console.log("[SpotifyAuthCallback] Exchanging code for token");

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      client_secret: SPOTIFY_CLIENT_SECRET,
    });

    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error("[SpotifyAuthCallback] Token exchange failed:", tokenResponse.status, error);
      return {
        statusCode: 302,
        headers: {
          Location:
            mode === "presave"
              ? `${FRONTEND_BASE}/presave/${slug}?spotify=error`
              : `${FRONTEND_BASE}/dashboard?spotify=error&reason=token_exchange_failed`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch user profile from Spotify
    console.log("[SpotifyAuthCallback] Fetching user profile");

    const meResponse = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!meResponse.ok) {
      const error = await meResponse.text();
      console.error("[SpotifyAuthCallback] User profile fetch failed:", meResponse.status, error);
      return {
        statusCode: 302,
        headers: {
          Location:
            mode === "presave"
              ? `${FRONTEND_BASE}/presave/${slug}?spotify=error`
              : `${FRONTEND_BASE}/dashboard?spotify=error&reason=profile_fetch_failed`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    const meData = await meResponse.json();
    const spotifyUserId = meData.id;
    const displayName = meData.display_name || meData.id;
    const country = meData.country;
    const email = meData.email;

    console.log("[SpotifyAuthCallback] User profile retrieved:", spotifyUserId);

    // Handle based on mode
    if (mode === "presave") {
      // Log pre-save event
      console.log("[SpotifyAuthCallback] Logging presave event for slug:", slug);

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Look up presave_link_id from slug
      const { data: presaveLink } = await supabase
        .from("presave_links")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      const { error: insertError } = await supabase.from("spotify_presaves").insert({
        presave_slug: slug,
        presave_link_id: presaveLink?.id || null,
        fan_spotify_user_id: spotifyUserId,
        fan_country: country,
        fan_display_name: displayName,
        fan_email: email,
      });

      if (insertError) {
        console.error("[SpotifyAuthCallback] Failed to log presave:", insertError);
        return {
          statusCode: 302,
          headers: {
            Location: `${FRONTEND_BASE}/presave/${slug}?spotify=error`,
            "Cache-Control": "no-cache",
          },
          body: "",
        };
      }

      console.log("[SpotifyAuthCallback] Presave logged successfully");

      // Redirect back to presave landing with success
      return {
        statusCode: 302,
        headers: {
          Location: `${FRONTEND_BASE}/presave/${slug}?spotify=success`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    } else {
      // Dashboard mode - just redirect with success
      console.log("[SpotifyAuthCallback] Dashboard mode - redirecting");

      return {
        statusCode: 302,
        headers: {
          Location: `${FRONTEND_BASE}${redirectTo}?spotify=connected`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }
  } catch (err: any) {
    console.error("[SpotifyAuthCallback] Unexpected error:", err);

    return {
      statusCode: 302,
      headers: {
        Location: `${FRONTEND_BASE}/dashboard?spotify=error&reason=server_error`,
        "Cache-Control": "no-cache",
      },
      body: "",
    };
  }
};
