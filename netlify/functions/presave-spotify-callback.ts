import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

/**
 * Pre-Save Spotify OAuth Callback
 *
 * Exchanges authorization code for access/refresh tokens and stores them
 * for auto-save functionality on release date.
 */

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FRONTEND_BASE = process.env.URL || "https://ghoste.one";

export const handler: Handler = async (event) => {
  console.log("[presave-spotify-callback] Callback received");

  try {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) {
      console.error("[presave-spotify-callback] Missing credentials");
      return {
        statusCode: 302,
        headers: {
          Location: `${FRONTEND_BASE}?error=server_config`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    const params = event.queryStringParameters || {};
    const code = params.code;
    const stateParam = params.state;
    const error = params.error;

    // Check for OAuth errors
    if (error) {
      console.warn("[presave-spotify-callback] OAuth error:", error);
      const state = stateParam ? JSON.parse(decodeURIComponent(stateParam)) : {};
      const slug = state.slug || "";
      return {
        statusCode: 302,
        headers: {
          Location: slug
            ? `${FRONTEND_BASE}/s/${slug}?presave=cancelled`
            : `${FRONTEND_BASE}?error=${encodeURIComponent(error)}`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    if (!code) {
      console.error("[presave-spotify-callback] Missing authorization code");
      return {
        statusCode: 302,
        headers: {
          Location: `${FRONTEND_BASE}?error=missing_code`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    // Decode state
    let slug = "";
    let presave_id = "";
    let fan_email = "";
    let forever_save = true;

    if (stateParam) {
      try {
        const state = JSON.parse(decodeURIComponent(stateParam));
        slug = state.slug || "";
        presave_id = state.presave_id || "";
        fan_email = state.email || "";
        forever_save = state.forever_save !== false; // Default true
        console.log("[presave-spotify-callback] State:", { slug, presave_id, forever_save });
      } catch (err) {
        console.warn("[presave-spotify-callback] Failed to parse state:", err);
      }
    }

    if (!slug && !presave_id) {
      console.error("[presave-spotify-callback] Missing presave identification");
      return {
        statusCode: 302,
        headers: {
          Location: `${FRONTEND_BASE}?error=missing_presave_id`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    // Exchange code for tokens
    console.log("[presave-spotify-callback] Exchanging code for tokens");

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
      console.error("[presave-spotify-callback] Token exchange failed:", tokenResponse.status, error);
      return {
        statusCode: 302,
        headers: {
          Location: slug
            ? `${FRONTEND_BASE}/s/${slug}?presave=token_failed`
            : `${FRONTEND_BASE}?error=token_exchange_failed`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;

    console.log("[presave-spotify-callback] Tokens received, expires in:", expiresIn);

    // Fetch user profile
    console.log("[presave-spotify-callback] Fetching user profile");

    const meResponse = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!meResponse.ok) {
      const error = await meResponse.text();
      console.error("[presave-spotify-callback] Profile fetch failed:", meResponse.status, error);
      return {
        statusCode: 302,
        headers: {
          Location: slug
            ? `${FRONTEND_BASE}/s/${slug}?presave=profile_failed`
            : `${FRONTEND_BASE}?error=profile_fetch_failed`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    const meData = await meResponse.json();
    const spotifyUserId = meData.id;
    const displayName = meData.display_name || meData.id;
    const email = meData.email;

    console.log("[presave-spotify-callback] User profile retrieved:", spotifyUserId);

    // Store signup in database
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve presave_id and owner_id if only slug provided
    let owner_id = "";

    if (!presave_id && slug) {
      const { data: link } = await supabase
        .from("smart_links")
        .select("id, user_id")
        .eq("slug", slug)
        .eq("link_type", "presave")
        .maybeSingle();

      if (link) {
        presave_id = link.id;
        owner_id = link.user_id;
      }
    } else if (presave_id) {
      // Get owner_id from presave_id
      const { data: link } = await supabase
        .from("smart_links")
        .select("user_id")
        .eq("id", presave_id)
        .maybeSingle();

      if (link) {
        owner_id = link.user_id;
      }
    }

    if (!presave_id || !owner_id) {
      console.error("[presave-spotify-callback] Could not resolve presave_id or owner_id");
      return {
        statusCode: 302,
        headers: {
          Location: slug
            ? `${FRONTEND_BASE}/s/${slug}?presave=link_not_found`
            : `${FRONTEND_BASE}?error=presave_not_found`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    // Calculate token expiry
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Use fan's email if provided, otherwise use Spotify email
    const finalEmail = fan_email || email;

    // Insert or update signup
    const { error: upsertError } = await supabase
      .from("presave_signups")
      .upsert(
        {
          presave_id,
          spotify_user_id: spotifyUserId,
          spotify_access_token: accessToken,
          spotify_refresh_token: refreshToken,
          token_expires_at: tokenExpiresAt,
          has_consented: true,
          fan_email: finalEmail,
          fan_name: displayName,
          forever_save: forever_save,
          metadata: {
            connected_at: new Date().toISOString(),
            country: meData.country,
          },
        },
        {
          onConflict: "presave_id,spotify_user_id",
        }
      );

    if (upsertError) {
      console.error("[presave-spotify-callback] Failed to store signup:", upsertError);
      return {
        statusCode: 302,
        headers: {
          Location: slug
            ? `${FRONTEND_BASE}/s/${slug}?presave=save_failed`
            : `${FRONTEND_BASE}?error=save_failed`,
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    console.log("[presave-spotify-callback] Signup stored successfully");

    // If forever_save is enabled, store in fan_music_connections for future releases
    if (forever_save && finalEmail && owner_id) {
      console.log("[presave-spotify-callback] Storing forever save connection");

      const { error: connectionError } = await supabase
        .from("fan_music_connections")
        .upsert(
          {
            owner_user_id: owner_id,
            fan_email: finalEmail,
            spotify_user_id: spotifyUserId,
            spotify_access_token: accessToken,
            spotify_refresh_token: refreshToken,
            spotify_token_expires_at: tokenExpiresAt,
            forever_save: true,
            metadata: {
              display_name: displayName,
              country: meData.country,
              connected_via_presave: presave_id,
              connected_at: new Date().toISOString(),
            },
          },
          {
            onConflict: "owner_user_id,fan_email",
          }
        );

      if (connectionError) {
        console.warn("[presave-spotify-callback] Failed to store forever save connection:", connectionError);
        // Don't fail the request - signup still succeeded
      } else {
        console.log("[presave-spotify-callback] Forever save connection stored");
      }
    }

    // Redirect back to presave landing with success
    return {
      statusCode: 302,
      headers: {
        Location: slug
          ? `${FRONTEND_BASE}/s/${slug}?presave=success`
          : `${FRONTEND_BASE}?presave=success`,
        "Cache-Control": "no-cache",
      },
      body: "",
    };
  } catch (err: any) {
    console.error("[presave-spotify-callback] Unexpected error:", err);

    return {
      statusCode: 302,
      headers: {
        Location: `${FRONTEND_BASE}?error=server_error`,
        "Cache-Control": "no-cache",
      },
      body: "",
    };
  }
};
