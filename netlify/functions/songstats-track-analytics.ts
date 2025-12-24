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
    const { spotifyTrackId } = JSON.parse(event.body || "{}");
    if (!spotifyTrackId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing spotifyTrackId" })
      };
    }

    const results: any = {};

    for (const source of SOURCES) {
      try {
        const data = await songstatsFetch(
          `/tracks/stats?source=${source}&spotify_track_id=${spotifyTrackId}`
        );

        results[source] = {
          spotifyStreams:
            source === "spotify"
              ? findNumber(data, ["streams_total", "play_count", "streams"])
              : null,
          plays: findNumber(data, ["plays", "play_count", "streams", "views"]),
          raw: data,
        };
      } catch (e: any) {
        console.warn(`[songstats-track] Failed to fetch ${source}:`, e.message);
        results[source] = {
          error: e.message,
          spotifyStreams: null,
          plays: null,
        };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, spotifyTrackId, results }),
    };
  } catch (e: any) {
    console.error("[songstats-track] Error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
