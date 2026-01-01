import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

interface SoundUrlResult {
  tiktok_sound_url?: string;
  facebook_sound_url?: string;
  confidence: 'high' | 'medium' | 'low' | 'none';
  source: string;
  message?: string;
}

/**
 * Look up sound URLs for TikTok and Facebook/Instagram using Songstats API
 * Falls back gracefully if Songstats unavailable
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  const supabase = getSupabaseAdmin();

  const authHeader = event.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "unauthorized" }),
    };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "invalid_token" }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { title, artist, spotify_track_id, isrc } = body;

    if (!title && !isrc && !spotify_track_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "missing_track_info",
          message: "Provide at least title, isrc, or spotify_track_id",
        }),
      };
    }

    console.log('[songstats-sound-lookup] Looking up sound URLs:', { title, artist, isrc, spotify_track_id });

    const result: SoundUrlResult = {
      confidence: 'none',
      source: 'none',
    };

    // Try Songstats API if key available
    const SONGSTATS_API_KEY = process.env.SONGSTATS_API_KEY;

    if (SONGSTATS_API_KEY) {
      try {
        const songstatsResult = await lookupViaSongstats(
          { title, artist, isrc, spotify_track_id },
          SONGSTATS_API_KEY
        );

        if (songstatsResult) {
          Object.assign(result, songstatsResult);
        }
      } catch (err) {
        console.error('[songstats-sound-lookup] Songstats lookup failed:', err);
      }
    } else {
      console.log('[songstats-sound-lookup] No Songstats API key configured');
    }

    // If Songstats didn't provide URLs, generate fallback search links
    if (!result.tiktok_sound_url && !result.facebook_sound_url) {
      const searchQuery = encodeURIComponent(`${title || ''} ${artist || ''}`.trim());

      // TikTok fallback: deep link to search
      if (searchQuery) {
        result.tiktok_sound_url = `https://www.tiktok.com/search?q=${searchQuery}`;
      }

      result.confidence = 'low';
      result.source = 'search_fallback';
      result.message = 'Could not find exact sound URLs via Songstats. TikTok search link provided. Paste Facebook sound URL manually if needed.';
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        ...result,
      }),
    };
  } catch (err: any) {
    console.error('[songstats-sound-lookup] Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: "internal_error",
        message: err.message || "Failed to lookup sound URLs",
      }),
    };
  }
};

async function lookupViaSongstats(
  trackInfo: {
    title?: string;
    artist?: string;
    isrc?: string;
    spotify_track_id?: string;
  },
  apiKey: string
): Promise<SoundUrlResult | null> {
  console.log('[songstats-sound-lookup] Attempting Songstats lookup');

  try {
    let trackId: string | null = null;

    // Try ISRC first (most reliable)
    if (trackInfo.isrc) {
      trackId = await searchByISRC(trackInfo.isrc, apiKey);
    }

    // Try Spotify ID if no ISRC or ISRC didn't work
    if (!trackId && trackInfo.spotify_track_id) {
      trackId = await searchBySpotifyId(trackInfo.spotify_track_id, apiKey);
    }

    // Try title + artist search
    if (!trackId && trackInfo.title) {
      const query = `${trackInfo.title} ${trackInfo.artist || ''}`.trim();
      trackId = await searchByQuery(query, apiKey);
    }

    if (!trackId) {
      console.log('[songstats-sound-lookup] No track found in Songstats');
      return null;
    }

    console.log('[songstats-sound-lookup] Found track ID:', trackId);

    // Get track links/URLs
    const links = await getTrackLinks(trackId, apiKey);

    if (!links) {
      console.log('[songstats-sound-lookup] No links found for track');
      return null;
    }

    // Extract sound URLs
    let tiktok_sound_url: string | undefined;
    let facebook_sound_url: string | undefined;

    if (links.platforms) {
      // Look for TikTok sound URL
      const tiktokData = links.platforms.find((p: any) =>
        p.name?.toLowerCase() === 'tiktok' || p.platform === 'tiktok'
      );
      if (tiktokData) {
        tiktok_sound_url = tiktokData.url || tiktokData.shortUrl || tiktokData.link;
      }

      // Look for Facebook/IG sound URL
      const fbData = links.platforms.find((p: any) =>
        ['facebook', 'instagram'].includes(p.name?.toLowerCase() || p.platform)
      );
      if (fbData) {
        facebook_sound_url = fbData.url || fbData.shortUrl || fbData.link;
      }
    }

    if (tiktok_sound_url || facebook_sound_url) {
      return {
        tiktok_sound_url,
        facebook_sound_url,
        confidence: 'high',
        source: 'songstats',
      };
    }

    return null;
  } catch (err) {
    console.error('[songstats-sound-lookup] Songstats error:', err);
    return null;
  }
}

async function searchByISRC(isrc: string, apiKey: string): Promise<string | null> {
  const url = `https://api.songstats.com/enterprise/v1/tracks?isrc=${encodeURIComponent(isrc)}`;

  const response = await fetch(url, {
    headers: {
      'apikey': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data.items?.[0]?.id || data.tracks?.[0]?.id || null;
}

async function searchBySpotifyId(spotifyId: string, apiKey: string): Promise<string | null> {
  const url = `https://api.songstats.com/enterprise/v1/tracks?spotify_id=${encodeURIComponent(spotifyId)}`;

  const response = await fetch(url, {
    headers: {
      'apikey': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data.items?.[0]?.id || data.tracks?.[0]?.id || null;
}

async function searchByQuery(query: string, apiKey: string): Promise<string | null> {
  const url = `https://api.songstats.com/enterprise/v1/tracks/search?query=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      'apikey': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data.items?.[0]?.id || data.results?.[0]?.id || data.tracks?.[0]?.id || null;
}

async function getTrackLinks(trackId: string, apiKey: string): Promise<any> {
  const url = `https://api.songstats.com/enterprise/v1/tracks/${trackId}`;

  const response = await fetch(url, {
    headers: {
      'apikey': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data;
}
