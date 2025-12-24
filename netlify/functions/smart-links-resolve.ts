import type { Handler } from "@netlify/functions";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// ============================================================================
// TYPES
// ============================================================================

type SmartLinkResolveRequest = {
  url?: string;   // Spotify/Apple/YouTube/etc. URL
  query?: string; // "Artist - Song" text search
};

type PlatformLinks = {
  spotifyUrl?: string;
  appleMusicUrl?: string;
  youtubeMusicUrl?: string;
  tidalUrl?: string;
  soundcloudUrl?: string;
  deezerUrl?: string;
};

type CanonicalTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string | null;
  spotifyUrl?: string;
  isrc?: string;
  popularity?: number;
  duration_ms?: number;
};

type SmartLinkResolveResponse = {
  ok: boolean;
  reason?: string;
  canonical?: CanonicalTrack;
  platforms?: PlatformLinks;
  candidates?: CanonicalTrack[]; // For query-based flows where user must choose
};

// ============================================================================
// SPOTIFY HELPERS
// ============================================================================

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string> {
  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expiresAt) {
    return spotifyTokenCache.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials not configured");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new Error(`Spotify token request failed: ${response.status}`);
  }

  const data = await response.json();

  spotifyTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
  };

  return data.access_token;
}

function extractSpotifyId(url: string): string | null {
  const patterns = [
    /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/,
    /spotify:track:([a-zA-Z0-9]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

async function getSpotifyTrackById(id: string): Promise<any | null> {
  try {
    const token = await getSpotifyToken();

    const response = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error(`[Spotify] Track fetch failed: ${response.status}`);
      return null;
    }

    return response.json();
  } catch (err) {
    console.error("[Spotify] getSpotifyTrackById error:", err);
    return null;
  }
}

async function searchSpotifyTracks(query: string, limit = 3): Promise<any[]> {
  try {
    const token = await getSpotifyToken();

    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: String(limit),
    });

    const response = await fetch(
      `https://api.spotify.com/v1/search?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      console.error(`[Spotify] Search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.tracks?.items || [];
  } catch (err) {
    console.error("[Spotify] searchSpotifyTracks error:", err);
    return [];
  }
}

function mapSpotifyTrack(track: any): CanonicalTrack {
  const primaryArtist = track.artists?.[0];
  return {
    id: track.id,
    title: track.name,
    artist: primaryArtist?.name ?? "",
    album: track.album?.name,
    artworkUrl: track.album?.images?.[0]?.url ?? null,
    spotifyUrl: track.external_urls?.spotify,
    isrc: track.external_ids?.isrc,
    popularity: track.popularity,
    duration_ms: track.duration_ms,
  };
}

// ============================================================================
// AUDD HELPERS
// ============================================================================

async function auddLookupByUrl(url: string): Promise<any | null> {
  try {
    const apiToken = process.env.AUDD_API_KEY;

    if (!apiToken) {
      console.warn("[AUDD] API key not configured");
      return null;
    }

    const params = new URLSearchParams({
      api_token: apiToken,
      url: url,
      return: "apple_music,spotify,youtube,deezer,soundcloud",
    });

    const response = await fetch("https://api.audd.io/", {
      method: "POST",
      body: params,
    });

    if (!response.ok) {
      console.error(`[AUDD] HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.status !== "success") {
      console.warn("[AUDD] Non-success status:", data.status);
      return null;
    }

    return data;
  } catch (err) {
    console.error("[AUDD] auddLookupByUrl error:", err);
    return null;
  }
}

function mapAuddToPlatforms(auddJson: any): {
  platforms: PlatformLinks;
  artist?: string;
  title?: string;
} {
  const result = auddJson?.result;
  if (!result) return { platforms: {} };

  const artist = result.artist || result?.spotify?.artists?.[0]?.name || undefined;
  const title = result.title || result.full_title || result?.spotify?.name || undefined;

  const platforms: PlatformLinks = {};

  // Spotify
  const sp = result.spotify;
  if (sp?.external_urls?.spotify) {
    platforms.spotifyUrl = sp.external_urls.spotify;
  } else if (sp?.id) {
    platforms.spotifyUrl = `https://open.spotify.com/track/${sp.id}`;
  }

  // Apple Music
  if (result.apple_music?.url) {
    platforms.appleMusicUrl = result.apple_music.url;
  }

  // YouTube Music
  if (result.youtube?.url) {
    platforms.youtubeMusicUrl = result.youtube.url;
  }

  // Deezer
  if (result.deezer?.url) {
    platforms.deezerUrl = result.deezer.url;
  }

  // SoundCloud
  if (result.soundcloud?.url) {
    platforms.soundcloudUrl = result.soundcloud.url;
  }

  return { platforms, artist, title };
}

// ============================================================================
// NORMALIZATION
// ============================================================================

function normalize(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ============================================================================
// HANDLER
// ============================================================================

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}") as SmartLinkResolveRequest;
    const { url, query } = body;

    // ========================================================================
    // 1) URL PROVIDED - Handle Spotify or non-Spotify URL
    // ========================================================================
    if (url) {
      const isSpotify = url.includes("open.spotify.com/track/") || url.includes("spotify:track:");
      let canonical: CanonicalTrack | undefined;
      let platforms: PlatformLinks = {};

      // --------------------------------------------------------------------
      // 1A) SPOTIFY URL → Use Spotify as canonical source
      // --------------------------------------------------------------------
      if (isSpotify) {
        const spotifyId = extractSpotifyId(url);
        if (!spotifyId) {
          return {
            statusCode: 200,
            headers: RESPONSE_HEADERS,
            body: JSON.stringify({
              ok: false,
              reason: "INVALID_SPOTIFY_URL",
            } as SmartLinkResolveResponse),
          };
        }

        const track = await getSpotifyTrackById(spotifyId);
        if (!track) {
          return {
            statusCode: 200,
            headers: RESPONSE_HEADERS,
            body: JSON.stringify({
              ok: false,
              reason: "SPOTIFY_TRACK_NOT_FOUND",
            } as SmartLinkResolveResponse),
          };
        }

        canonical = mapSpotifyTrack(track);
        platforms.spotifyUrl = canonical.spotifyUrl || url;

        // Use AUDD only for popular tracks (more likely to have accurate cross-platform data)
        const popularity = track.popularity ?? 0;
        console.log(`[Resolver] Spotify track popularity: ${popularity}`);

        if (popularity >= 40) {
          console.log("[Resolver] High popularity, calling AUDD for cross-platform links");
          const audd = await auddLookupByUrl(url);

          if (audd) {
            const { platforms: auddPlatforms, artist: auddArtist, title: auddTitle } = mapAuddToPlatforms(audd);

            // Only trust AUDD if artist+title roughly match Spotify
            const sameArtist = normalize(auddArtist || "") === normalize(canonical.artist);
            const sameTitle = normalize(auddTitle || "") === normalize(canonical.title);

            console.log(`[Resolver] AUDD match check: artist=${sameArtist}, title=${sameTitle}`);

            if (sameArtist && sameTitle) {
              platforms = { ...platforms, ...auddPlatforms };
              console.log(`[Resolver] AUDD platforms accepted:`, Object.keys(auddPlatforms));
            } else {
              console.warn("[Resolver] AUDD artist/title mismatch, ignoring AUDD results");
            }
          }
        } else {
          console.log("[Resolver] Low popularity, skipping AUDD (indie/small artist)");
        }

        return {
          statusCode: 200,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({
            ok: true,
            canonical,
            platforms,
          } as SmartLinkResolveResponse),
        };
      }

      // --------------------------------------------------------------------
      // 1B) NON-SPOTIFY URL → Use AUDD first, then Spotify as canonical
      // --------------------------------------------------------------------
      console.log("[Resolver] Non-Spotify URL, calling AUDD");
      const audd = await auddLookupByUrl(url);

      if (!audd) {
        return {
          statusCode: 200,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({
            ok: false,
            reason: "AUDD_LOOKUP_FAILED",
          } as SmartLinkResolveResponse),
        };
      }

      const { platforms: auddPlatforms, artist, title } = mapAuddToPlatforms(audd);
      platforms = { ...auddPlatforms };

      // If AUDD found a Spotify URL, fetch that track as canonical
      if (auddPlatforms.spotifyUrl) {
        console.log("[Resolver] AUDD found Spotify URL, fetching as canonical");
        const spId = extractSpotifyId(auddPlatforms.spotifyUrl);
        if (spId) {
          const track = await getSpotifyTrackById(spId);
          if (track) {
            canonical = mapSpotifyTrack(track);
            console.log("[Resolver] Canonical set from Spotify");
          }
        }
      }

      // If still no canonical but we have artist/title from AUDD, create minimal canonical
      if (!canonical && artist && title) {
        console.log("[Resolver] No Spotify canonical, using AUDD metadata");
        canonical = {
          id: "",
          title,
          artist,
          album: undefined,
          artworkUrl: null,
          spotifyUrl: platforms.spotifyUrl,
        };
      }

      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          ok: !!canonical,
          canonical,
          platforms,
        } as SmartLinkResolveResponse),
      };
    }

    // ========================================================================
    // 2) NO URL, ONLY QUERY → Search Spotify, return candidates
    // ========================================================================
    if (query && query.trim() !== "") {
      console.log(`[Resolver] Text search query: ${query}`);
      const tracks = await searchSpotifyTracks(query, 3);

      if (!tracks || tracks.length === 0) {
        return {
          statusCode: 200,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({
            ok: false,
            reason: "NO_SPOTIFY_RESULTS",
          } as SmartLinkResolveResponse),
        };
      }

      const candidates = tracks.map(mapSpotifyTrack);
      console.log(`[Resolver] Found ${candidates.length} Spotify candidates`);

      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          ok: true,
          candidates,
        } as SmartLinkResolveResponse),
      };
    }

    // ========================================================================
    // 3) NO INPUT → Error
    // ========================================================================
    return {
      statusCode: 400,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        ok: false,
        reason: "NO_INPUT",
      } as SmartLinkResolveResponse),
    };
  } catch (err) {
    console.error("[smart-links-resolve] error", err);
    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        ok: false,
        reason: "SERVER_ERROR",
        error: err instanceof Error ? err.message : String(err),
      } as SmartLinkResolveResponse),
    };
  }
};
