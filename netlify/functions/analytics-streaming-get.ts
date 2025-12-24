import type { Handler } from "@netlify/functions";
import { sb, jsonHeaders } from "./_sb";
import { supabaseAdmin } from "./_supabaseAdmin";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEBUG_VERSION = "analytics-streaming-v1.0.0";

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: { ...jsonHeaders, ...CORS_HEADERS },
    body: JSON.stringify(data),
  };
}

function pickNumber(v: any): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/,/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
}

function normalizeAnalytics(raw: any, artistId: string, artistName: string) {
  const sp = raw?.spotify || raw?.platformSignals?.spotify || {};
  const yt = raw?.youtube || raw?.platformSignals?.youtube || {};
  const tt = raw?.tiktok || raw?.platformSignals?.tiktok || {};
  const ig = raw?.instagram || raw?.platformSignals?.instagram || {};
  const am = raw?.apple_music || raw?.platformSignals?.apple_music || {};

  const trend = raw?.trend || raw?.history || raw?.timeseries || raw?.series || [];
  const streamsByDay = Array.isArray(trend) && trend.length
    ? trend.map((x: any) => ({
        date: x?.date || x?.day || "—",
        value: pickNumber(x?.value ?? x?.count ?? x?.streams) ?? 0,
      }))
    : [];

  const topTracks = raw?.top_tracks || raw?.tracks || [];
  const topTracksNormalized = Array.isArray(topTracks)
    ? topTracks.slice(0, 10).map((t: any) => ({
        track_id: t?.id || t?.track_id || null,
        name: t?.name || t?.title || "Unknown Track",
        streams: pickNumber(t?.streams ?? t?.play_count ?? t?.plays) ?? 0,
      }))
    : [];

  const topCities = raw?.top_cities || raw?.cities || [];
  const topCitiesNormalized = Array.isArray(topCities)
    ? topCities.slice(0, 10).map((c: any) => ({
        name: c?.city || c?.name || "Unknown",
        listeners: pickNumber(c?.listeners ?? c?.count) ?? 0,
      }))
    : [];

  return {
    artist_id: artistId,
    artist_name: artistName,
    platforms: {
      spotify: {
        streams_total: pickNumber(sp?.streams),
        listeners_total: pickNumber(sp?.monthlyListeners ?? sp?.monthly_listeners),
        saves_total: pickNumber(sp?.saves),
        followers_total: pickNumber(sp?.followers),
        streams_by_day: streamsByDay,
        top_tracks: topTracksNormalized,
        top_cities: topCitiesNormalized,
      },
      youtube: {
        subscribers: pickNumber(yt?.subscribers),
        views: pickNumber(yt?.views),
      },
      tiktok: {
        followers: pickNumber(tt?.followers),
        likes: pickNumber(tt?.likes),
        views: pickNumber(tt?.views),
      },
      instagram: {
        followers: pickNumber(ig?.followers),
      },
      apple_music: {
        followers: pickNumber(am?.followers),
        plays: pickNumber(am?.plays),
      },
    },
  };
}

/**
 * analytics-streaming-get
 *
 * Single source of truth for streaming analytics data
 * Fetches from songstats_cache and normalizes the response
 */
export const handler: Handler = async (event) => {
  console.log("[analytics-streaming-get] Request received:", event.httpMethod);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }

  // Validate auth
  const authHeader = event.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "UNAUTHORIZED" });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await sb.auth.getUser(token);

  if (authError || !user) {
    return jsonResponse(401, { error: "UNAUTHORIZED" });
  }

  const userId = user.id;

  // Parse body
  let body: {
    range?: "7d" | "28d" | "90d";
    artist_id?: string;
    spotify_artist_id?: string; // Alternative key
  };

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "INVALID_JSON" });
  }

  const range = body.range || "28d";
  const spotifyArtistId = body.spotify_artist_id || body.artist_id;

  console.log("[analytics-streaming-get] Fetching analytics:", {
    userId: userId.substring(0, 8) + "...",
    range,
    spotifyArtistId,
  });

  try {
    // Fetch saved artists for this user
    const { data: savedArtists, error: savedError } = await supabaseAdmin
      .from("saved_artists")
      .select("spotify_artist_id, name, image")
      .eq("user_id", userId);

    if (savedError) {
      console.error("[analytics-streaming-get] Error fetching saved artists:", savedError);
    }

    const artists = [];

    // If specific artist requested, fetch just that one
    if (spotifyArtistId) {
      const { data: cached } = await supabaseAdmin
        .from("songstats_cache")
        .select("payload, spotify_artist_id, artist_name")
        .eq("spotify_artist_id", spotifyArtistId)
        .eq("status", "ready")
        .maybeSingle();

      if (cached?.payload) {
        const normalized = normalizeAnalytics(
          cached.payload,
          cached.spotify_artist_id,
          cached.artist_name || "Unknown Artist"
        );
        artists.push(normalized);
      }
    } else if (savedArtists && savedArtists.length > 0) {
      // Fetch all saved artists' analytics
      for (const saved of savedArtists) {
        const { data: cached } = await supabaseAdmin
          .from("songstats_cache")
          .select("payload, spotify_artist_id, artist_name")
          .eq("spotify_artist_id", saved.spotify_artist_id)
          .eq("status", "ready")
          .maybeSingle();

        if (cached?.payload) {
          const normalized = normalizeAnalytics(
            cached.payload,
            cached.spotify_artist_id,
            cached.artist_name || saved.name || "Unknown Artist"
          );
          artists.push(normalized);
        }
      }
    }

    // If no data available, return empty but valid structure
    if (artists.length === 0) {
      return jsonResponse(200, {
        success: true,
        range,
        generated_at: new Date().toISOString(),
        artists: [],
        message: "No analytics data available. Please add and track an artist first.",
        debug_version: DEBUG_VERSION,
      });
    }

    return jsonResponse(200, {
      success: true,
      range,
      generated_at: new Date().toISOString(),
      artists,
      debug_version: DEBUG_VERSION,
    });
  } catch (err: any) {
    console.error("[analytics-streaming-get] Error:", err);
    return jsonResponse(500, {
      error: "ANALYTICS_FETCH_ERROR",
      message: err.message || "Failed to fetch analytics",
      debug_version: DEBUG_VERSION,
    });
  }
};

export default handler;
