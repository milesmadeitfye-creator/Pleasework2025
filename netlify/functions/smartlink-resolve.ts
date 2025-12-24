// netlify/functions/smartlink-resolve.ts
import type { Handler } from "@netlify/functions";
import { getSecret } from "./_shared/secrets";

const json = (statusCode: number, body: any) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  },
  body: JSON.stringify(body),
});

const truncate = (s: string, n = 1200) => (s && s.length > n ? s.slice(0, n) + "…(truncated)" : s);

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  const debug: any = {
    steps: [],
    acr: { attempted: false },
    input: {},
    ts: new Date().toISOString(),
  };

  try {
    const raw = event.body || "{}";
    const payload = JSON.parse(raw);

    // Accept flexible input formats
    const input: string | undefined = payload?.input || payload?.url || payload?.source_url || payload?.spotify_url;
    const query: string | undefined = payload?.query;
    const isrc: string | undefined = payload?.isrc;

    debug.input = { input, query, isrc };

    // --- ACR CONFIG CHECK ---
    const baseUrl = process.env.ACRCLOUD_BASE_URL || "https://eu-api-v2.acrcloud.com";
    const token = await getSecret("ACRCLOUD_OAUTH_TOKEN");

    debug.acr.baseUrl = baseUrl;
    debug.acr.hasToken = !!token;

    if (!token) {
      debug.steps.push("missing_acr_token");
      console.error("[smartlink-resolve] ACRCLOUD_OAUTH_TOKEN not found in app_secrets");
      // return 200 so frontend can display it (instead of 500)
      return json(200, {
        ok: false,
        error: "missing_acr_token",
        message: "ACRCLOUD_OAUTH_TOKEN not found in app_secrets",
        debug
      });
    }

    // --- ACR REQUEST (primary) ---
    debug.steps.push("acr_start");
    debug.acr.attempted = true;

    const endpoint = `${baseUrl.replace(/\/$/, "")}/api/external-metadata/tracks`;

    // Determine input type
    const isUrl = input && /^https?:\/\//i.test(input);

    const params = new URLSearchParams();
    // Priority: isrc > input (URL or text) > query
    if (isrc) {
      params.set("isrc", isrc);
    } else if (input) {
      if (isUrl) {
        params.set("source_url", input);
      } else {
        // Text search (Artist - Song)
        params.set("query", input);
        params.set("format", "text");
      }
    } else if (query) {
      // If query is plain text allow it; if object passed, stringify it.
      if (typeof payload.query === "object") {
        params.set("query", JSON.stringify(payload.query));
        params.set("format", "json");
      } else {
        params.set("query", String(query));
        params.set("format", "text");
      }
    } else {
      debug.steps.push("no_input");
      return json(200, {
        ok: false,
        error: "no_input",
        message: "Missing input. Provide a music URL or Artist - Song text.",
        debug
      });
    }

    // ✅ ACR LIMIT: Max 5 platforms per request
    // Priority order: Spotify, Apple Music, YouTube, Amazon Music, Tidal
    const defaultPlatforms = "spotify,applemusic,youtube,amazonmusic,tidal";
    params.set("platforms", defaultPlatforms);
    debug.steps.push(`acr_platforms:5`);

    const finalUrl = `${endpoint}?${params.toString()}`;
    debug.acr.finalUrl = finalUrl;

    // timeout guard
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);

    const resp = await fetch(finalUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(t));

    const text = await resp.text();
    debug.acr.status = resp.status;
    debug.acr.body = truncate(text);

    if (!resp.ok) {
      debug.steps.push(`acr_http_${resp.status}`);
      // return 200 w/ debug instead of 500
      return json(200, { ok: false, error: "acr_http_error", debug });
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch (e: any) {
      debug.steps.push("acr_bad_json");
      debug.acr.parseError = String(e?.message || e);
      return json(200, { ok: false, error: "acr_bad_json", debug });
    }

    debug.steps.push("acr_ok");

    // Normalize ACRCloud response
    const first = data?.data?.[0];

    // Initialize output with empty links
    const links: Record<string, string> = {};

    // ✅ Always set spotify from input if it's a Spotify track URL
    if (input && /open\.spotify\.com\/track\//i.test(input)) {
      links.spotify = input;
      debug.steps.push("spotify_from_input");
    }

    // Extract metadata from first result
    let title = null;
    let artist = null;
    let artwork_url = null;

    if (first) {
      title = first?.name || first?.title || null;
      artist = first?.artists?.[0]?.name || first?.artist || null;

      // ✅ Artwork (prefer Spotify album covers with fallbacks)
      artwork_url =
        first?.album?.covers?.large ||
        first?.album?.cover ||
        first?.external_metadata?.applemusic?.[0]?.album?.cover ||
        first?.album?.cover_url ||
        first?.cover_url ||
        null;

      const em = first?.external_metadata || {};

      // ✅ Apple Music link
      const appleLink = em?.applemusic?.[0]?.link;
      if (appleLink) {
        links.apple_music = appleLink;
        debug.steps.push("apple_from_external_metadata");
      }

      // ✅ YouTube / YouTube Music link
      const ytLink = em?.youtube?.[0]?.link;
      if (ytLink) {
        links.youtube = ytLink;
        debug.steps.push("youtube_from_external_metadata");
      }

      // ✅ Deezer link
      const deezerLink = em?.deezer?.[0]?.link;
      if (deezerLink) {
        links.deezer = deezerLink;
        debug.steps.push("deezer_from_external_metadata");
      }

      // ✅ Tidal link
      const tidalLink = em?.tidal?.[0]?.link;
      if (tidalLink) {
        links.tidal = tidalLink;
        debug.steps.push("tidal_from_external_metadata");
      }

      // ✅ Amazon Music link
      const amazonLink = em?.amazonmusic?.[0]?.link || em?.amazon?.[0]?.link;
      if (amazonLink) {
        links.amazon_music = amazonLink;
        debug.steps.push("amazon_from_external_metadata");
      }

      // ✅ SoundCloud link
      const soundcloudLink = em?.soundcloud?.[0]?.link;
      if (soundcloudLink) {
        links.soundcloud = soundcloudLink;
        debug.steps.push("soundcloud_from_external_metadata");
      }

      // Fallback: check external_urls if external_metadata didn't have links
      if (!links.spotify && first?.external_urls?.spotify) {
        links.spotify = first.external_urls.spotify;
        debug.steps.push("spotify_from_external_urls");
      }
      if (!links.apple_music && (first?.external_urls?.applemusic || first?.external_urls?.apple_music)) {
        links.apple_music = first.external_urls.applemusic || first.external_urls.apple_music;
        debug.steps.push("apple_from_external_urls");
      }
      if (!links.youtube && first?.external_urls?.youtube) {
        links.youtube = first.external_urls.youtube;
        debug.steps.push("youtube_from_external_urls");
      }

      // Last resort: construct URLs from IDs
      const externalIds = first?.external_ids || {};
      if (!links.spotify && externalIds.spotify) {
        links.spotify = `https://open.spotify.com/track/${externalIds.spotify}`;
        debug.steps.push("spotify_constructed_from_id");
      }
      if (!links.apple_music && externalIds.applemusic) {
        links.apple_music = `https://music.apple.com/us/album/${externalIds.applemusic}`;
        debug.steps.push("apple_constructed_from_id");
      }
      if (!links.youtube && externalIds.youtube) {
        links.youtube = `https://www.youtube.com/watch?v=${externalIds.youtube}`;
        debug.steps.push("youtube_constructed_from_id");
      }
    }

    // ✅ Count links for debugging
    const linkCount = Object.values(links).filter(Boolean).length;
    debug.steps.push(`links_count:${linkCount}`);

    // --- FALLBACK: Spotify Search if no links found ---
    if (linkCount === 0 && (title || query || input)) {
      debug.steps.push("fallback_spotify_search");

      try {
        // Get Spotify app token
        const tokenEndpoint = process.env.URL
          ? `${process.env.URL}/.netlify/functions/spotify-app-token`
          : '/.netlify/functions/spotify-app-token';

        const tokenResponse = await fetch(tokenEndpoint);

        if (tokenResponse.ok) {
          const { access_token } = await tokenResponse.json();

          // Build search query
          let searchQuery = "";
          if (title && artist) {
            searchQuery = `${artist} ${title}`;
          } else if (query) {
            searchQuery = query;
          } else if (input && !isUrl) {
            searchQuery = input;
          }

          if (searchQuery) {
            const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=1`;
            const searchResponse = await fetch(searchUrl, {
              headers: { Authorization: `Bearer ${access_token}` },
            });

            if (searchResponse.ok) {
              const searchData = await searchResponse.json();
              const track = searchData.tracks?.items?.[0];

              if (track) {
                links.spotify = track.external_urls?.spotify || null;
                title = title || track.name;
                artist = artist || track.artists?.[0]?.name;
                artwork_url = artwork_url || track.album?.images?.[0]?.url;

                debug.steps.push("spotify_search_success");
              }
            }
          }
        }
      } catch (err: any) {
        debug.steps.push(`spotify_search_error:${err.message}`);
      }
    }

    // --- FALLBACK: Apple Music iTunes Search if still no Apple link ---
    if (!links.apple_music && (title || query || input)) {
      debug.steps.push("fallback_apple_search");

      try {
        let searchQuery = "";
        if (title && artist) {
          searchQuery = `${artist} ${title}`;
        } else if (query) {
          searchQuery = query;
        } else if (input && !isUrl) {
          searchQuery = input;
        }

        if (searchQuery) {
          const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&entity=song&limit=1`;
          const searchResponse = await fetch(searchUrl);

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const track = searchData.results?.[0];

            if (track) {
              links.apple_music = track.trackViewUrl || null;
              title = title || track.trackName;
              artist = artist || track.artistName;
              artwork_url = artwork_url || track.artworkUrl100?.replace("100x100", "600x600");

              debug.steps.push("apple_search_success");
            }
          }
        }
      } catch (err: any) {
        debug.steps.push(`apple_search_error:${err.message}`);
      }
    }

    return json(200, {
      ok: true,
      title,
      artist,
      artwork_url,
      links,
      provider_used: linkCount > 0 ? 'acr' : 'fallback_search',
      debug
    });
  } catch (err: any) {
    // This is the key: stop silent 500s
    debug.steps.push("caught_exception");
    debug.exception = {
      message: String(err?.message || err),
      stack: truncate(String(err?.stack || "")),
      name: err?.name,
    };
    console.error("[smartlink-resolve] fatal", debug.exception);
    return json(200, { ok: false, error: "exception", debug });
  }
};
