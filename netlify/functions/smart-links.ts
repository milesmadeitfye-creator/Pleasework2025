import type { Handler } from "@netlify/functions";
import {
  auddRecognizeByUrl,
  auddSearchByText,
  mapAuddToSmartLinks,
} from "./_auddClient";

interface BaseTrack {
  title: string;
  artist: string;
  artists: string[];
  isrc?: string;
  durationSec?: number;
  album?: string;
  releaseDate?: string;
  label?: string;
  coverArtUrl?: string;
}

interface MatchResult {
  url?: string;
  coverArtUrl?: string;
  confidence: number;
}

interface DeepLinkResponse {
  artist: string;
  title: string;

  spotifyUrl?: string;
  appleMusicUrl?: string;
  youtubeUrl?: string;
  tidalUrl?: string;
  soundcloudUrl?: string;

  spotifyCoverArtUrl?: string;
  appleMusicCoverArtUrl?: string;
  youtubeCoverArtUrl?: string;
  tidalCoverArtUrl?: string;
  soundcloudCoverArtUrl?: string;

  appleMusicConfidence?: number;
  youtubeConfidence?: number;
  tidalConfidence?: number;
  soundcloudConfidence?: number;
}

function norm(s?: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[''"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitArtists(str?: string): string[] {
  if (!str) return [];
  return str
    .split(/[,/&]|feat\.|ft\./i)
    .map((s) => norm(s))
    .filter(Boolean);
}

function scoreArtists(base: BaseTrack, candArtist?: string): { score: number; hit: boolean } {
  const baseSet = new Set<string>();

  [base.artist, ...base.artists].forEach((name) => {
    const n = norm(name);
    if (n) baseSet.add(n);
    splitArtists(name).forEach((p) => baseSet.add(p));
  });

  const candParts = splitArtists(candArtist);
  if (!baseSet.size || !candParts.length) {
    return { score: 0, hit: false };
  }

  let exactOrStrong = false;
  let soft = false;

  for (const c of candParts) {
    if (baseSet.has(c)) {
      exactOrStrong = true;
      break;
    }
  }

  if (!exactOrStrong) {
    for (const c of candParts) {
      for (const b of Array.from(baseSet)) {
        if (b && c && (b.includes(c) || c.includes(b))) {
          soft = true;
          break;
        }
      }
      if (soft) break;
    }
  }

  if (exactOrStrong) return { score: 5, hit: true };
  if (soft) return { score: 2, hit: true };
  return { score: 0, hit: false };
}

const MAX_SCORE_FOR_NORM = 30;
const MIN_SCORE_FOR_MATCH = 5;

function scoreCandidate(
  base: BaseTrack,
  cand: {
    artist?: string;
    title?: string;
    isrc?: string;
    durationSec?: number;
    album?: string;
    releaseDate?: string;
    label?: string;
  }
): { score: number; artistHit: boolean; isrcHit: boolean } {
  const rt = norm(base.title);
  const ct = norm(cand.title);
  const rAlbum = norm(base.album);
  const cAlbum = norm(cand.album);
  const rl = norm(base.label);
  const cl = norm(cand.label);

  let score = 0;

  const isrcHit = !!(base.isrc && cand.isrc && base.isrc === cand.isrc);
  if (isrcHit) score += 10;

  const { score: artistScore, hit: artistHit } = scoreArtists(base, cand.artist);
  score += artistScore;

  if (rt && ct) {
    if (ct === rt) score += 5;
    else if (ct.includes(rt) || rt.includes(ct)) score += 3;
  }

  if (base.durationSec && cand.durationSec) {
    const diff = Math.abs(base.durationSec - cand.durationSec);
    if (diff <= 2) score += 4;
    else if (diff <= 5) score += 3;
    else if (diff <= 10) score += 1;
  }

  if (base.releaseDate && cand.releaseDate) {
    const by = parseInt(base.releaseDate.slice(0, 4), 10);
    const cy = parseInt(cand.releaseDate.slice(0, 4), 10);
    if (!isNaN(by) && !isNaN(cy)) {
      const diff = Math.abs(by - cy);
      if (diff === 0) score += 2;
      else if (diff === 1) score += 1;
    }
  }

  if (rAlbum && cAlbum) {
    if (rAlbum === cAlbum) score += 2;
    else if (cAlbum.includes(rAlbum) || rAlbum.includes(cAlbum)) score += 1;
  }

  if (rl && cl) {
    if (rl === cl) score += 2;
    else if (cl.includes(rl) || rl.includes(cl)) score += 1;
  }

  return { score, artistHit, isrcHit };
}

function toConfidence(score: number): number {
  return Math.max(0, Math.min(1, score / MAX_SCORE_FOR_NORM));
}

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    console.warn("Spotify credentials missing");
    return null;
  }

  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expiresAt) {
    return spotifyTokenCache.token;
  }

  try {
    const auth = Buffer.from(`${id}:${secret}`).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      console.error("Spotify token error", res.status, await res.text().catch(() => ""));
      return null;
    }

    const data = await res.json();
    spotifyTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return spotifyTokenCache.token;
  } catch (err) {
    console.error("Spotify token exception", err);
    return null;
  }
}

async function getBaseTrackFromSpotify(
  spotifyUrl?: string,
  fallbackArtist?: string,
  fallbackTitle?: string
): Promise<BaseTrack | null> {
  if (!spotifyUrl || !spotifyUrl.includes("open.spotify.com/track")) {
    if (!fallbackArtist || !fallbackTitle) return null;
    return {
      title: fallbackTitle,
      artist: fallbackArtist,
      artists: [fallbackArtist],
    };
  }

  const id = spotifyUrl.split("/track/")[1]?.split("?")[0];
  if (!id) return null;

  const token = await getSpotifyToken();
  if (token) {
    try {
      const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const t = await res.json();
        const durationSec =
          typeof t.duration_ms === "number"
            ? Math.round(t.duration_ms / 1000)
            : undefined;

        return {
          title: t.name,
          artist: t.artists?.[0]?.name || "",
          artists: (t.artists || []).map((a: any) => a.name),
          isrc: t.external_ids?.isrc || "",
          durationSec,
          album: t.album?.name,
          releaseDate: t.album?.release_date,
          label: "",
          coverArtUrl:
            Array.isArray(t.album?.images) && t.album.images.length > 0
              ? t.album.images[0].url
              : "",
        };
      }
    } catch (err) {
      console.error("Spotify track fetch error", err);
    }
  }

  try {
    const o = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`
    );
    if (o.ok) {
      const data = await o.json();
      const artist = data.author_name || fallbackArtist || "";
      const title = data.title || fallbackTitle || "";
      return {
        title,
        artist,
        artists: [artist].filter(Boolean),
        coverArtUrl: data.thumbnail_url || "",
      };
    }
  } catch (err) {
    console.error("Spotify oEmbed error", err);
  }

  return null;
}

async function resolveApple(base: BaseTrack): Promise<MatchResult> {
  const q = `${base.artist} ${base.title}`.trim();
  if (!q) return { confidence: 0 };

  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(
        q
      )}&entity=song&limit=10`
    );
    if (!res.ok) {
      console.warn("Apple search failed", res.status);
      return { confidence: 0 };
    }
    const data = await res.json();
    const results: any[] = data.results || [];
    if (!results.length) return { confidence: 0 };

    let best: any = null;
    let bestScore = -1;
    let bestFlags = { artistHit: false, isrcHit: false };

    for (const r of results) {
      const candDuration = r.trackTimeMillis
        ? Math.round(r.trackTimeMillis / 1000)
        : undefined;

      const { score, artistHit, isrcHit } = scoreCandidate(base, {
        artist: r.artistName,
        title: r.trackName,
        isrc: r.isrc,
        durationSec: candDuration,
        album: r.collectionName,
        releaseDate: r.releaseDate,
      });

      if (score > bestScore) {
        bestScore = score;
        best = r;
        bestFlags = { artistHit, isrcHit };
      }
    }

    if (
      best &&
      best.trackViewUrl &&
      bestScore >= MIN_SCORE_FOR_MATCH &&
      (bestFlags.artistHit || bestFlags.isrcHit)
    ) {
      const cover =
        best.artworkUrl100 ||
        best.artworkUrl60 ||
        best.artworkUrl512 ||
        "";
      return {
        url: best.trackViewUrl as string,
        coverArtUrl: cover,
        confidence: toConfidence(bestScore),
      };
    }
  } catch (err) {
    console.error("Apple resolve error", err);
  }

  return { confidence: 0 };
}

function parseYouTubeDuration(iso?: string): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  const h = parseInt(m[1] || "0", 10);
  const mi = parseInt(m[2] || "0", 10);
  const s = parseInt(m[3] || "0", 10);
  return h * 3600 + mi * 60 + s;
}

function parseYouTubeTitle(raw: string): { artist?: string; title?: string } {
  const m = raw.match(/^(.*?)\s*[-–]\s*(.+)$/);
  if (!m) return { title: raw };
  return { artist: m[1], title: m[2] };
}

async function resolveYouTubeMusic(base: BaseTrack): Promise<MatchResult> {
  const key = process.env.YOUTUBE_API_KEY;
  const q = `${base.artist} ${base.title}`.trim();
  if (!key || !q) {
    return { confidence: 0 };
  }

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(
        q
      )}&key=${key}`
    );
    if (!searchRes.ok) {
      console.warn("YouTube search failed", searchRes.status);
      return { confidence: 0 };
    }

    const search = await searchRes.json();
    const items: any[] = search.items || [];
    if (!items.length) return { confidence: 0 };

    const ids = items.map((i) => i.id?.videoId).filter(Boolean);
    const durations: Record<string, number | undefined> = {};

    if (ids.length) {
      const videosRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids.join(
          ","
        )}&key=${key}`
      );
      if (videosRes.ok) {
        const videos = await videosRes.json();
        for (const v of videos.items || []) {
          durations[v.id] = parseYouTubeDuration(v.contentDetails?.duration);
        }
      }
    }

    let best: { vid: string; thumb: string } | null = null;
    let bestScore = -1;
    let bestFlags = { artistHit: false, isrcHit: false };

    for (const item of items) {
      const vid = item.id?.videoId;
      if (!vid) continue;

      const rawTitle = item.snippet?.title || "";
      const channel = item.snippet?.channelTitle || "";
      const { artist: parsedArtist, title: parsedTitle } = parseYouTubeTitle(
        rawTitle
      );

      const candArtist = parsedArtist || channel;
      const candTitle = parsedTitle || rawTitle;
      const candDur = durations[vid];

      const { score, artistHit, isrcHit } = scoreCandidate(base, {
        artist: candArtist,
        title: candTitle,
        durationSec: candDur,
      });

      if (score > bestScore) {
        bestScore = score;
        best = {
          vid,
          thumb:
            item.snippet?.thumbnails?.high?.url ||
            item.snippet?.thumbnails?.medium?.url ||
            item.snippet?.thumbnails?.default?.url ||
            "",
        };
        bestFlags = { artistHit, isrcHit };
      }
    }

    if (
      best &&
      bestScore >= MIN_SCORE_FOR_MATCH &&
      (bestFlags.artistHit || bestFlags.isrcHit)
    ) {
      return {
        url: `youtubemusic://watch?v=${best.vid}`,
        coverArtUrl: best.thumb,
        confidence: toConfidence(bestScore),
      };
    }
  } catch (err) {
    console.error("YouTube resolve error", err);
  }

  return { confidence: 0 };
}

async function resolveSoundCloud(base: BaseTrack): Promise<MatchResult> {
  const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
  const q = `${base.artist} ${base.title}`.trim();
  if (!clientId || !q) {
    return { confidence: 0 };
  }

  try {
    const res = await fetch(
      `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
        q
      )}&client_id=${clientId}&limit=5`
    );
    if (!res.ok) {
      console.warn("SoundCloud search failed", res.status);
      return { confidence: 0 };
    }
    const data = await res.json();
    const items: any[] = data.collection || [];
    if (!items.length) return { confidence: 0 };

    let best: any = null;
    let bestScore = -1;
    let bestFlags = { artistHit: false, isrcHit: false };

    for (const t of items) {
      const candDur = t.duration ? Math.round(t.duration / 1000) : undefined;

      const { score, artistHit, isrcHit } = scoreCandidate(base, {
        artist: t.user?.username,
        title: t.title,
        durationSec: candDur,
        label: t.label_name,
      });

      if (score > bestScore) {
        bestScore = score;
        best = t;
        bestFlags = { artistHit, isrcHit };
      }
    }

    if (
      best &&
      best.id &&
      bestScore >= MIN_SCORE_FOR_MATCH &&
      (bestFlags.artistHit || bestFlags.isrcHit)
    ) {
      const cover =
        best.artwork_url ||
        best.user?.avatar_url ||
        "";
      return {
        url: `soundcloud://tracks:${best.id}`,
        coverArtUrl: cover,
        confidence: toConfidence(bestScore),
      };
    }
  } catch (err) {
    console.error("SoundCloud resolve error", err);
  }

  return { confidence: 0 };
}

async function resolveTidal(_base: BaseTrack): Promise<MatchResult> {
  return { confidence: 0 };
}


const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}") as {
      spotifyUrl?: string;
      musicUrl?: string;
      artist?: string;
      title?: string;
    };

    // Prefer musicUrl over spotifyUrl for generality
    const inputUrl = body.musicUrl || body.spotifyUrl;

    // Try AUDD first for multi-platform resolution
    let auddResult = null;
    let isUrlInput = false;

    try {
      if (inputUrl && inputUrl.trim()) {
        console.log("[smart-links] Using AUDD to recognize URL:", inputUrl);
        auddResult = await auddRecognizeByUrl(inputUrl.trim());
        isUrlInput = true;
      } else if (body.artist && body.title) {
        console.log("[smart-links] Using AUDD to search text:", `${body.artist} ${body.title}`);
        auddResult = await auddSearchByText(`${body.artist} ${body.title}`);
        isUrlInput = false;
      }
    } catch (auddErr) {
      console.warn("[smart-links] AUDD failed:", auddErr);
    }

    // If AUDD succeeded, map and return
    if (auddResult) {
      const mapped = mapAuddToSmartLinks(auddResult);

      // For text-only queries (no URL), check confidence
      if (!isUrlInput) {
        const confidence = mapped.isrc ? 0.9 : 0.5; // Higher confidence if we have ISRC

        // Require high confidence for text queries to avoid wrong matches
        if (confidence < 0.8) {
          console.log("[smart-links] Low confidence for text query, rejecting");
          return {
            statusCode: 200,
            headers: RESPONSE_HEADERS,
            body: JSON.stringify({
              ok: false,
              reason: "LOW_CONFIDENCE",
              confidence,
              message: "I couldn't confidently match that song. Please paste a Spotify, Apple Music, or YouTube link instead."
            }),
          };
        }
      }

      const response: DeepLinkResponse = {
        artist: mapped.artist || body.artist || "",
        title: mapped.title || body.title || "",
        spotifyUrl: mapped.links.spotify || (isUrlInput && inputUrl?.includes('spotify.com') ? inputUrl : undefined),
        appleMusicUrl: mapped.links.appleMusic || (isUrlInput && inputUrl?.includes('apple.com') ? inputUrl : undefined),
        youtubeUrl: mapped.links.youtubeMusic || (isUrlInput && inputUrl?.includes('youtube.com') ? inputUrl : undefined),
        tidalUrl: mapped.links.tidal || (isUrlInput && inputUrl?.includes('tidal.com') ? inputUrl : undefined),
        soundcloudUrl: mapped.links.soundcloud || (isUrlInput && inputUrl?.includes('soundcloud.com') ? inputUrl : undefined),
        spotifyCoverArtUrl: mapped.cover || undefined,
      };

      console.log("[smart-links] AUDD success, returning:", {
        artist: response.artist,
        title: response.title,
        isUrlInput,
        platforms: {
          spotify: !!response.spotifyUrl,
          apple: !!response.appleMusicUrl,
          youtube: !!response.youtubeUrl,
          tidal: !!response.tidalUrl,
          soundcloud: !!response.soundcloudUrl
        }
      });

      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ ok: true, ...response }),
      };
    }

    // Fallback: try the old Spotify-based resolution
    console.log("[smart-links] AUDD unavailable, falling back to Spotify API");
    const base = await getBaseTrackFromSpotify(
      body.spotifyUrl,
      body.artist,
      body.title
    );

    if (!base) {
      const fallback: DeepLinkResponse = {
        artist: body.artist || "",
        title: body.title || "",
      };
      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify(fallback),
      };
    }

    const response: DeepLinkResponse = {
      artist: base.artist,
      title: base.title,
      spotifyCoverArtUrl: base.coverArtUrl || "",
    };

    if (body.spotifyUrl && body.spotifyUrl.includes("/track/")) {
      const id = body.spotifyUrl.split("/track/")[1]?.split("?")[0];
      if (id) {
        response.spotifyUrl = `spotify:track:${id}`;
      }
    }

    const [apple, yt, tidal, sc] = await Promise.all([
      resolveApple(base),
      resolveYouTubeMusic(base),
      resolveTidal(base),
      resolveSoundCloud(base),
    ]);

    if (apple.url) {
      response.appleMusicUrl = apple.url;
      response.appleMusicCoverArtUrl = apple.coverArtUrl;
      response.appleMusicConfidence = apple.confidence;
    }
    if (yt.url) {
      response.youtubeUrl = yt.url;
      response.youtubeCoverArtUrl = yt.coverArtUrl;
      response.youtubeConfidence = yt.confidence;
    }
    if (tidal.url) {
      response.tidalUrl = tidal.url;
      response.tidalCoverArtUrl = tidal.coverArtUrl;
      response.tidalConfidence = tidal.confidence;
    }
    if (sc.url) {
      response.soundcloudUrl = sc.url;
      response.soundcloudCoverArtUrl = sc.coverArtUrl;
      response.soundcloudConfidence = sc.confidence;
    }

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify(response),
    };
  } catch (err: any) {
    console.error("smart-links fatal error", err);
    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        error: "AUTO_RESOLVE_FAILED",
        message: err.message || "Could not resolve platforms"
      }),
    };
  }
};
