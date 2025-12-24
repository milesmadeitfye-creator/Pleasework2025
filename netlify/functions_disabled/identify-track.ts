import type { Handler } from "@netlify/functions";

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

function norm(s?: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[''"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    console.warn("Spotify credentials missing for identify-track");
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

async function getSpotifyBaseTrack(spotifyUrl?: string): Promise<BaseTrack | null> {
  if (!spotifyUrl || !spotifyUrl.includes("open.spotify.com/track")) {
    return null;
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
          typeof t.duration_ms === "number" ? Math.round(t.duration_ms / 1000) : undefined;

        const base: BaseTrack = {
          title: t.name,
          artist: t.artists?.[0]?.name || "",
          artists: (t.artists || []).map((a: any) => a.name),
          isrc: t.external_ids?.isrc || "",
          durationSec,
          album: t.album?.name,
          releaseDate: t.album?.release_date,
          coverArtUrl:
            Array.isArray(t.album?.images) && t.album.images.length > 0
              ? t.album.images[0].url
              : "",
        };

        return base;
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
      const base: BaseTrack = {
        title: data.title || "",
        artist: data.author_name || "",
        artists: [data.author_name || ""].filter(Boolean),
        coverArtUrl: data.thumbnail_url || "",
      };
      return base;
    }
  } catch (err) {
    console.error("Spotify oEmbed error", err);
  }

  return null;
}

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}") as { spotifyUrl?: string };

    const base = await getSpotifyBaseTrack(body.spotifyUrl);

    if (!base) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: false,
          reason: "Could not resolve Spotify track metadata.",
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        track: base,
      }),
    };
  } catch (err) {
    console.error("identify-track fatal error", err);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: false,
        reason: "Unexpected error identifying track.",
      }),
    };
  }
};
