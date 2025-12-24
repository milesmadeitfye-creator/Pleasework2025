// netlify/functions/spotify-refresh-stats.ts
import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID!;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : null;
    const userId = body?.userId as string | undefined;

    if (!userId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Missing userId"
        }),
      };
    }

    console.log("[spotify-refresh-stats] Refreshing stats for user:", userId.substring(0, 8));

    // 1) Check if user has existing stats connection
    const { data: existingStats, error: statsCheckError } = await supabase
      .from("spotify_artist_stats")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (statsCheckError) {
      console.error("[spotify-refresh-stats] statsCheckError", statsCheckError);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Failed to check Spotify connection",
          details: statsCheckError.message
        }),
      };
    }

    if (!existingStats) {
      console.warn("[spotify-refresh-stats] No Spotify connection found for user:", userId.substring(0, 8));
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "No Spotify connection found for this user",
        }),
      };
    }

    // 2) Get spotify_artist_url from user_profiles to verify it still exists
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("spotify_artist_url")
      .eq("id", userId)
      .single();

    if (profileError) {
      console.error("[spotify-refresh-stats] profileError", profileError);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Could not load user profile"
        }),
      };
    }

    const spotifyUrl = profile?.spotify_artist_url as string | null;
    if (!spotifyUrl) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "No Spotify artist URL configured"
        }),
      };
    }

    console.log("[spotify-refresh-stats] Spotify URL:", spotifyUrl);

    // 3) Extract artist ID from URL
    let artistId: string | null = null;
    try {
      const url = new URL(spotifyUrl);
      const segments = url.pathname.split("/").filter(Boolean);
      const artistIndex = segments.indexOf("artist");
      if (artistIndex !== -1 && segments[artistIndex + 1]) {
        artistId = segments[artistIndex + 1];
      }
    } catch (e) {
      console.error("[spotify-refresh-stats] invalid URL", e);
    }

    if (!artistId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Could not parse artist ID from URL"
        }),
      };
    }

    console.log("[spotify-refresh-stats] Artist ID:", artistId);

    // 4) Get Spotify app token (Client Credentials)
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            `${spotifyClientId}:${spotifyClientSecret}`
          ).toString("base64"),
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("[spotify-refresh-stats] token error", text);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Failed to get Spotify token"
        }),
      };
    }

    const tokenJson = (await tokenRes.json()) as { access_token: string };
    const accessToken = tokenJson.access_token;

    console.log("[spotify-refresh-stats] Got Spotify token");

    // 5) Fetch artist data
    const artistRes = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!artistRes.ok) {
      const text = await artistRes.text();
      console.error("[spotify-refresh-stats] artist error", text);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Failed to fetch artist data from Spotify"
        }),
      };
    }

    const artist = await artistRes.json();

    console.log("[spotify-refresh-stats] Fetched artist:", artist.name);

    const stats = {
      artist_id: artist.id as string,
      artist_name: artist.name as string,
      followers: artist.followers?.total ?? null,
      popularity: artist.popularity ?? null,
      genres: (artist.genres ?? []) as string[],
      image_url:
        Array.isArray(artist.images) && artist.images[0]
          ? artist.images[0].url
          : null,
    };

    // 6) Upsert into spotify_artist_stats
    const { error: upsertError } = await supabase
      .from("spotify_artist_stats")
      .upsert(
        {
          user_id: userId,
          artist_id: stats.artist_id,
          artist_name: stats.artist_name,
          followers: stats.followers,
          popularity: stats.popularity,
          genres: stats.genres,
          image_url: stats.image_url,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "user_id,artist_id" }
      );

    if (upsertError) {
      console.error("[spotify-refresh-stats] upsertError", upsertError);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Failed to store refreshed stats"
        }),
      };
    }

    console.log("[spotify-refresh-stats] Stats refreshed successfully");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        stats
      }),
    };
  } catch (err: any) {
    console.error("[spotify-refresh-stats] unexpected error", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: "Unexpected server error",
        details: err?.message || String(err)
      }),
    };
  }
};
