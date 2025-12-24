import type { Handler } from "@netlify/functions";
import { songstatsFetch, SongstatsSource } from "./_lib/songstatsClient";

const SOURCES: SongstatsSource[] = [
  "spotify",
  "apple_music",
  "youtube",
  "tidal",
  "amazon",
  "deezer",
  "soundcloud",
  "tiktok",
  "instagram",
  "shazam",
];

function findNumber(obj: any, keys: string[]): number | null {
  const stack = [obj];
  const seen = new Set<any>();

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);

    for (const k of keys) {
      if (typeof cur[k] === "number") return cur[k];
    }
    Object.values(cur).forEach(v => typeof v === "object" && stack.push(v));
  }
  return null;
}

export const handler: Handler = async (event) => {
  try {
    const { spotifyArtistId } = JSON.parse(event.body || "{}");
    if (!spotifyArtistId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing spotifyArtistId" })
      };
    }

    const results: any = {};

    for (const source of SOURCES) {
      try {
        const data = await songstatsFetch(
          `/artists/stats?source=${source}&spotify_artist_id=${spotifyArtistId}`
        );

        results[source] = {
          spotifyMonthlyListeners:
            source === "spotify"
              ? findNumber(data, ["monthly_listeners", "listeners_monthly"])
              : null,
          spotifyStreams:
            source === "spotify"
              ? findNumber(data, ["streams_total", "play_count", "streams"])
              : null,
          followers: findNumber(data, ["followers", "follower_count", "subscribers"]),
          plays: findNumber(data, ["plays", "play_count", "streams", "views"]),
          raw: data,
        };
      } catch (e: any) {
        console.warn(`[songstats-artist] Failed to fetch ${source}:`, e.message);
        results[source] = {
          error: e.message,
          spotifyMonthlyListeners: null,
          spotifyStreams: null,
          followers: null,
          plays: null,
        };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, spotifyArtistId, results }),
    };
  } catch (e: any) {
    console.error("[songstats-artist] Error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
