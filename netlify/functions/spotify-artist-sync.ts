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
        body: JSON.stringify({ error: "Missing userId" }),
      };
    }

    console.log("[spotify-artist-sync] Syncing stats for user:", userId.substring(0, 8));

    // 1) Get spotify_artist_url from user_profiles
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("spotify_artist_url")
      .eq("id", userId)
      .single();

    if (profileError) {
      console.error("[spotify-artist-sync] profileError", profileError);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Could not load user profile" }),
      };
    }

    const spotifyUrl = profile?.spotify_artist_url as string | null;
    if (!spotifyUrl) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No Spotify artist URL saved" }),
      };
    }

    console.log("[spotify-artist-sync] Spotify URL:", spotifyUrl);

    // 2) Extract artist ID from URL
    let artistId: string | null = null;
    try {
      const url = new URL(spotifyUrl);
      const segments = url.pathname.split("/").filter(Boolean);
      const artistIndex = segments.indexOf("artist");
      if (artistIndex !== -1 && segments[artistIndex + 1]) {
        artistId = segments[artistIndex + 1];
      }
    } catch (e) {
      console.error("[spotify-artist-sync] invalid URL", e);
    }

    if (!artistId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Could not parse artist ID from URL" }),
      };
    }

    console.log("[spotify-artist-sync] Artist ID:", artistId);

    // 3) Get Spotify app token (Client Credentials)
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
      console.error("[spotify-artist-sync] token error", text);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to get Spotify token" }),
      };
    }

    const tokenJson = (await tokenRes.json()) as { access_token: string };
    const accessToken = tokenJson.access_token;

    console.log("[spotify-artist-sync] Got Spotify token");

    // 4) Fetch artist data
    const artistRes = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!artistRes.ok) {
      const text = await artistRes.text();
      console.error("[spotify-artist-sync] artist error", text);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to fetch artist data" }),
      };
    }

    const artist = await artistRes.json();

    console.log("[spotify-artist-sync] Fetched artist:", artist.name);

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

    // 5) Upsert into spotify_artist_stats
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
      console.error("[spotify-artist-sync] upsertError", upsertError);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to store stats" }),
      };
    }

    console.log("[spotify-artist-sync] Stats stored successfully");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stats }),
    };
  } catch (err) {
    console.error("[spotify-artist-sync] unexpected error", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Unexpected server error" }),
    };
  }
};
