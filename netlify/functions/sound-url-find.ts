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
 * Auto-find sound URLs for TikTok and Facebook/Instagram from track metadata
 * Uses Songstats API when available, provides fallbacks otherwise
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
    const { track_title, artist_name, isrc, spotify_track_id } = body;

    if (!track_title && !isrc && !spotify_track_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "missing_track_info",
          message: "Provide at least track_title, isrc, or spotify_track_id",
        }),
      };
    }

    console.log('[sound-url-find] Looking up sound URLs:', { track_title, artist_name, isrc, spotify_track_id });

    const result: SoundUrlResult = {
      confidence: 'none',
      source: 'none',
    };

    // Try Songstats API if key is available
    if (process.env.SONGSTATS_API_KEY) {
      try {
        const songstatsResult = await findViaSongstats(
          { track_title, artist_name, isrc, spotify_track_id },
          user.id
        );
        if (songstatsResult) {
          Object.assign(result, songstatsResult);
        }
      } catch (err) {
        console.error('[sound-url-find] Songstats lookup failed:', err);
      }
    }

    // If Songstats didn't provide URLs, generate fallback search links
    if (!result.tiktok_sound_url && !result.facebook_sound_url) {
      const searchQuery = encodeURIComponent(`${track_title || ''} ${artist_name || ''}`.trim());

      // TikTok fallback: deep link to search (not perfect but functional)
      result.tiktok_sound_url = `https://www.tiktok.com/search?q=${searchQuery}`;

      // Facebook/IG: No reliable URL without API
      // Leave null and UI will show manual paste option

      result.confidence = 'low';
      result.source = 'search_fallback';
      result.message = 'Could not find exact sound URLs. TikTok search link provided. Paste Facebook sound URL manually if needed.';
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        ...result,
      }),
    };
  } catch (err: any) {
    console.error('[sound-url-find] Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: "internal_error",
        message: err.message || "Failed to find sound URLs",
      }),
    };
  }
};

/**
 * Attempt to find sound URLs via Songstats API
 */
async function findViaSongstats(
  trackInfo: {
    track_title?: string;
    artist_name?: string;
    isrc?: string;
    spotify_track_id?: string;
  },
  userId: string
): Promise<SoundUrlResult | null> {
  const SONGSTATS_API_KEY = process.env.SONGSTATS_API_KEY;
  if (!SONGSTATS_API_KEY) return null;

  console.log('[sound-url-find] Attempting Songstats lookup');

  try {
    // First, search for the track
    let trackId: string | null = null;

    if (trackInfo.isrc) {
      // Search by ISRC (most reliable)
      const searchUrl = `https://api.songstats.com/tracks?isrc=${trackInfo.isrc}`;
      const searchRes = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${SONGSTATS_API_KEY}`,
          'Accept': 'application/json',
        },
      });

      if (searchRes.ok) {
        const data = await searchRes.json();
        if (data.tracks && data.tracks.length > 0) {
          trackId = data.tracks[0].id;
        }
      }
    }

    // If no ISRC or not found, try Spotify ID
    if (!trackId && trackInfo.spotify_track_id) {
      const searchUrl = `https://api.songstats.com/tracks?spotify_id=${trackInfo.spotify_track_id}`;
      const searchRes = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${SONGSTATS_API_KEY}`,
          'Accept': 'application/json',
        },
      });

      if (searchRes.ok) {
        const data = await searchRes.json();
        if (data.tracks && data.tracks.length > 0) {
          trackId = data.tracks[0].id;
        }
      }
    }

    // If no track ID yet, try title + artist search
    if (!trackId && trackInfo.track_title) {
      const query = `${trackInfo.track_title} ${trackInfo.artist_name || ''}`.trim();
      const searchUrl = `https://api.songstats.com/tracks/search?query=${encodeURIComponent(query)}`;
      const searchRes = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${SONGSTATS_API_KEY}`,
          'Accept': 'application/json',
        },
      });

      if (searchRes.ok) {
        const data = await searchRes.json();
        if (data.tracks && data.tracks.length > 0) {
          trackId = data.tracks[0].id;
        }
      }
    }

    if (!trackId) {
      console.log('[sound-url-find] No track found in Songstats');
      return null;
    }

    console.log('[sound-url-find] Found track ID:', trackId);

    // Now get the track links/URLs
    const linksUrl = `https://api.songstats.com/tracks/${trackId}/links`;
    const linksRes = await fetch(linksUrl, {
      headers: {
        'Authorization': `Bearer ${SONGSTATS_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!linksRes.ok) {
      console.log('[sound-url-find] Failed to get track links');
      return null;
    }

    const linksData = await linksRes.json();

    // Extract TikTok and Facebook/IG sound URLs from the links
    let tiktok_sound_url: string | undefined;
    let facebook_sound_url: string | undefined;

    if (linksData.links) {
      // Look for TikTok sound URL
      const tiktokLink = linksData.links.find((l: any) =>
        l.platform === 'tiktok' || l.type === 'tiktok' || l.url?.includes('tiktok.com')
      );
      if (tiktokLink) {
        tiktok_sound_url = tiktokLink.url || tiktokLink.shortUrl;
      }

      // Look for Facebook/IG sound URL
      const fbLink = linksData.links.find((l: any) =>
        l.platform === 'facebook' || l.platform === 'instagram' ||
        l.url?.includes('facebook.com') || l.url?.includes('instagram.com')
      );
      if (fbLink) {
        facebook_sound_url = fbLink.url || fbLink.shortUrl;
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
    console.error('[sound-url-find] Songstats error:', err);
    return null;
  }
}
