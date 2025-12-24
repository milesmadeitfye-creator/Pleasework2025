export type SongstatsResponse = any;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
  };
}

const ENRICH_ENDPOINT = "/.netlify/functions/analytics-artist-enrich";

export async function fetchSongstatsAnalytics(params: {
  spotifyArtistId: string;
  force?: boolean;
}) {
  const res = await fetch(ENRICH_ENDPOINT, {
    method: "POST",
    headers: noCacheHeaders(),
    body: JSON.stringify({
      spotifyArtistId: params.spotifyArtistId,
      force: !!params.force,
      ts: Date.now(),
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = data?.error || data?.message || `Analytics fetch failed (${res.status})`;
    throw new Error(msg);
  }

  if (!data) throw new Error("No analytics data returned");
  return data as SongstatsResponse;
}
