import type { LinkVariant } from "./types";
import { calculateConfidence } from "./normalize";

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const clientId = "";
  const clientSecret = "";

  if (!clientId || !clientSecret) {
    console.warn("Spotify env vars missing, skipping Spotify resolution");
    return null;
  }

  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expiresAt) {
    return spotifyTokenCache.token;
  }

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const resp = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!resp.ok) {
      console.warn(
        "Spotify token request failed",
        resp.status,
        await resp.text().catch(() => "")
      );
      return null;
    }

    const data = await resp.json();
    spotifyTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return spotifyTokenCache.token;
  } catch (err) {
    console.error("Spotify token error:", err);
    return null;
  }
}

export async function resolveSpotify(
  artist: string,
  title: string,
  isrc?: string,
  knownLinks?: any
): Promise<LinkVariant | null> {
  try {
    const direct = knownLinks?.spotify;
    if (direct?.includes("open.spotify.com/track/")) {
      const id = direct.split("/track/")[1]?.split("?")[0];
      if (id) {
        return {
          id,
          webUrl: `https://open.spotify.com/track/${id}`,
          appSchemeUrl: `spotify:track:${id}`,
          confidence: 1,
        };
      }
    }

    const token = await getSpotifyToken();
    if (!token) return null;

    const q = encodeURIComponent(`${artist} ${title}`);
    const resp = await fetch(
      `https://api.spotify.com/v1/search?type=track&limit=8&q=${q}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) {
      console.warn(
        "Spotify search failed",
        resp.status,
        await resp.text().catch(() => "")
      );
      return null;
    }

    const data = await resp.json();
    const items = data.tracks?.items || [];
    if (!items.length) return null;

    let best: any = null;
    let bestScore = 0;

    for (const t of items) {
      const a = t.artists?.[0]?.name || "";
      const n = t.name || "";
      const isMatch = isrc && t.external_ids?.isrc === isrc;
      const score = calculateConfidence(artist, title, a, n, !!isMatch);
      if (score > bestScore) {
        best = t;
        bestScore = score;
      }
    }

    if (!best) return null;

    return {
      id: best.id,
      webUrl:
        best.external_urls?.spotify ||
        `https://open.spotify.com/track/${best.id}`,
      appSchemeUrl: `spotify:track:${best.id}`,
      confidence: bestScore,
    };
  } catch (err) {
    console.error("resolveSpotify error:", err);
    return null;
  }
}
