import type { Handler } from "@netlify/functions";
import { getSpotifyAccessToken, spotifyGet } from "./_lib/spotifyClient";

export const handler: Handler = async (event) => {
  try {
    const { q } = JSON.parse(event.body || "{}");
    if (!q) return { statusCode: 400, body: JSON.stringify({ error: "Missing q" }) };

    const token = await getSpotifyAccessToken();
    const url = `https://api.spotify.com/v1/search?type=artist&limit=10&q=${encodeURIComponent(q)}`;
    const json = await spotifyGet(url, token);

    const items = (json?.artists?.items || []).map((a: any) => ({
      spotify_artist_id: a.id,
      name: a.name,
      image: a.images?.[0]?.url || null,
      followers: a.followers?.total ?? null,
      popularity: a.popularity ?? null,
      genres: a.genres ?? [],
    }));

    return { statusCode: 200, body: JSON.stringify({ ok: true, q, items }) };
  } catch (e: any) {
    console.error("[analytics-artist-search] Error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: e?.message || "Server error" }) };
  }
};
