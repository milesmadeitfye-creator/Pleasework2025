import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabaseAdmin";
import { songstatsGet } from "./_lib/songstatsClient";

const TTL_HOURS = 24;
const NEXT_CHECK_HOURS = 2;

const SOURCES = [
  "spotify",
  "youtube",
  "apple_music",
  "tiktok",
  "instagram",
  "shazam",
  "soundcloud",
  "deezer",
  "amazon",
  "tidal",
] as const;

type Source = typeof SOURCES[number];

function deepFindNumber(obj: any, keys: string[]): number | null {
  const seen = new Set<any>();
  const stack = [obj];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    for (const k of keys) {
      if (typeof (cur as any)[k] === "number") return (cur as any)[k];
      const v = (cur as any)[k];
      if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v)) return Number(v);
    }

    for (const v of Object.values(cur)) {
      if (v && typeof v === "object") stack.push(v as any);
    }
  }

  return null;
}

function extractSignals(responses: Record<string, any>) {
  const signals: any = {};

  // Spotify (core)
  const spotify = responses.spotify;
  if (spotify && !spotify.error && !spotify.pending) {
    signals.spotify = {
      monthlyListeners: deepFindNumber(spotify, ["monthly_listeners", "monthlyListeners", "listeners_monthly"]),
      streams: deepFindNumber(spotify, ["streams_total", "stream_count", "play_count", "plays_total", "streams"]),
      followers: deepFindNumber(spotify, ["followers", "followers_total"]),
      popularity: deepFindNumber(spotify, ["popularity"]),
    };
  }

  // YouTube
  const yt = responses.youtube;
  if (yt && !yt.error && !yt.pending) {
    signals.youtube = {
      subscribers: deepFindNumber(yt, ["subscribers", "subscribers_total"]),
      views: deepFindNumber(yt, ["views", "views_total", "video_views"]),
    };
  }

  // Apple Music
  const am = responses.apple_music;
  if (am && !am.error && !am.pending) {
    signals.apple_music = {
      followers: deepFindNumber(am, ["followers", "followers_total"]),
      plays: deepFindNumber(am, ["plays", "plays_total", "play_count"]),
    };
  }

  // TikTok
  const tt = responses.tiktok;
  if (tt && !tt.error && !tt.pending) {
    signals.tiktok = {
      followers: deepFindNumber(tt, ["followers", "followers_total"]),
      likes: deepFindNumber(tt, ["likes", "likes_total"]),
      views: deepFindNumber(tt, ["views", "views_total"]),
    };
  }

  // Instagram
  const ig = responses.instagram;
  if (ig && !ig.error && !ig.pending) {
    signals.instagram = {
      followers: deepFindNumber(ig, ["followers", "followers_total"]),
    };
  }

  // Shazam
  const sh = responses.shazam;
  if (sh && !sh.error && !sh.pending) {
    signals.shazam = {
      shazams: deepFindNumber(sh, ["shazams", "shazams_total", "count"]),
    };
  }

  // Others (generic plays/followers if present)
  const generic = ["soundcloud", "deezer", "amazon", "tidal"];
  for (const key of generic) {
    const src = responses[key];
    if (src && !src.error && !src.pending) {
      signals[key] = {
        followers: deepFindNumber(src, ["followers", "followers_total"]),
        plays: deepFindNumber(src, ["plays", "plays_total", "play_count", "streams_total"]),
      };
    }
  }

  return signals;
}

const noCacheHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Access-Control-Allow-Origin": "*",
};

export const handler: Handler = async (event) => {
  const sb = supabaseAdmin;

  try {
    const { spotifyArtistId, force } = JSON.parse(event.body || "{}");
    if (!spotifyArtistId) {
      return { statusCode: 400, headers: noCacheHeaders, body: JSON.stringify({ error: "Missing spotifyArtistId" }) };
    }

    // Cache read: if pending, return immediately
    const { data: cached, error: cacheErr } = await sb
      .from("songstats_cache")
      .select("payload,fetched_at,status,last_message,last_error,next_check_at")
      .eq("spotify_artist_id", spotifyArtistId)
      .maybeSingle();

    // If schema cache ever glitches again, don't crash the app
    if (cacheErr?.message?.includes("schema cache")) {
      // continue without cache
    } else if (cacheErr) {
      throw cacheErr;
    }

    // Always return pending immediately (force doesn't override indexing)
    if (cached?.status === "pending") {
      return {
        statusCode: 200,
        headers: noCacheHeaders,
        body: JSON.stringify({
          ok: true,
          cached: true,
          status: "pending",
          spotifyArtistId,
          message: cached.last_message || "Songstats is indexing this artist from Spotify. Check back later.",
          nextCheckAt: cached.next_check_at || null,
        }),
      };
    }

    // If ready + within TTL, return cached payload (unless force refresh)
    if (!force && cached?.status === "ready" && cached?.payload && cached?.fetched_at) {
      const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
      const ttlMs = TTL_HOURS * 60 * 60 * 1000;
      if (ageMs < ttlMs) {
        return {
          statusCode: 200,
          headers: noCacheHeaders,
          body: JSON.stringify({ ok: true, cached: true, status: "ready", spotifyArtistId, ...cached.payload }),
        };
      }
    }

    // Fetch Songstats (multi-source)
    const responses: Record<string, any> = {};
    const pendingMessages: string[] = [];

    for (const source of SOURCES) {
      try {
        const res = await songstatsGet(
          `/artists/stats?source=${encodeURIComponent(source)}&spotify_artist_id=${encodeURIComponent(spotifyArtistId)}`
        );

        // If pending returned (302), capture it
        if (res?.__songstats_pending) {
          pendingMessages.push(res?.message || `${source}: indexing`);
          responses[source] = { pending: true, message: res?.message || "Indexing" };
        } else {
          responses[source] = res;
        }
      } catch (e: any) {
        // Don't fail whole request if one source errors
        responses[source] = { error: true, message: e?.message || "Source fetch failed" };
      }
    }

    // Pending handling: if Spotify is pending, return pending
    const spotifyPending = responses.spotify?.pending === true;

    if (spotifyPending) {
      const message = pendingMessages[0] || "Songstats is indexing this artist from Spotify. Check back later.";
      const nextCheckAt = new Date(Date.now() + NEXT_CHECK_HOURS * 60 * 60 * 1000).toISOString();

      await sb.from("songstats_cache").upsert(
        {
          spotify_artist_id: spotifyArtistId,
          status: "pending",
          last_message: message,
          next_check_at: nextCheckAt,
          last_error: null,
          payload: { pending: true, sources: responses },
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "spotify_artist_id" }
      );

      return {
        statusCode: 200,
        headers: noCacheHeaders,
        body: JSON.stringify({
          ok: true,
          cached: false,
          status: "pending",
          spotifyArtistId,
          message,
          nextCheckAt,
          sources: responses,
        }),
      };
    }

    // Ready flow: extract multi-platform signals
    const platformSignals = extractSignals(responses);

    const payload = {
      core: {
        spotifyMonthlyListeners: platformSignals?.spotify?.monthlyListeners ?? null,
        spotifyStreams: platformSignals?.spotify?.streams ?? null,
      },
      platformSignals,
      sources: responses,
    };

    await sb.from("songstats_cache").upsert(
      {
        spotify_artist_id: spotifyArtistId,
        status: "ready",
        last_message: null,
        last_error: null,
        next_check_at: null,
        payload,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "spotify_artist_id" }
    );

    return {
      statusCode: 200,
      headers: noCacheHeaders,
      body: JSON.stringify({ ok: true, cached: false, status: "ready", spotifyArtistId, ...payload }),
    };
  } catch (e: any) {
    // Store error (non-fatal)
    try {
      const { spotifyArtistId } = JSON.parse(event.body || "{}");
      if (spotifyArtistId) {
        await sb.from("songstats_cache").upsert(
          {
            spotify_artist_id: spotifyArtistId,
            status: "error",
            last_error: e?.message || "Songstats error",
            fetched_at: new Date().toISOString(),
            payload: { error: true },
          },
          { onConflict: "spotify_artist_id" }
        );
      }
    } catch {}

    return {
      statusCode: 200,
      headers: noCacheHeaders,
      body: JSON.stringify({
        ok: true,
        status: "error",
        message: e?.message || "Songstats error",
      }),
    };
  }
};
