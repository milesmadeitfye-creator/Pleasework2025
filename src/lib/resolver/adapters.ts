import type { CoreMeta, ResolveHit } from "./types";
import { scoreMatch } from "../fuzzy";

const AUDD_ENDPOINT = "https://api.audd.io/";

/**
 * AUDD Adapter - Expanded Platform Discovery
 *
 * Uses AUDD API to find a track on multiple platforms:
 * - Spotify (if not already provided)
 * - Apple Music
 * - Deezer
 * - YouTube Music (via fallback)
 *
 * Best results when given an ISRC from Spotify.
 */
export async function auddAdapter(meta: CoreMeta, skipSpotify = false): Promise<ResolveHit[]> {
  const apiToken = import.meta.env.VITE_AUDD_API_KEY;

  if (!apiToken) {
    console.warn("[AUDD] API key not configured, skipping AUDD adapter");
    return [];
  }

  const params = new URLSearchParams({
    api_token: apiToken,
    return: "apple_music,spotify,deezer",
  });

  // Prefer ISRC if available (best precision). Otherwise fall back to text.
  if (meta.isrc) params.set("isrc", meta.isrc);
  else params.set("q", `${meta.title} ${meta.artist}`);

  const resp = await fetch(AUDD_ENDPOINT, { method: "POST", body: params });
  if (!resp.ok) throw new Error(`AudD HTTP ${resp.status}`);
  const json = await resp.json();
  const r = json?.result;
  if (!r) return [];

  const hits: ResolveHit[] = [];

  // Spotify (skip if we already have it from Spotify adapter)
  if (!skipSpotify && r.spotify?.id) {
    const h = {
      platform: "spotify" as const,
      platform_id: r.spotify.id,
      title: r.spotify.name,
      artist: r.spotify.artists?.map((a: any) => a.name).join(", "),
      duration_ms: r.spotify.duration_ms,
      url: `https://open.spotify.com/track/${r.spotify.id}`,
      isrc: r.isrc || r.spotify?.external_ids?.isrc,
    };
    const confidence = scoreMatch(meta, h);
    if (confidence >= 0.9) hits.push({ platform: "spotify", platform_id: r.spotify.id, url_web: h.url, url_app: h.url, storefront: null, confidence });
  }

  // Apple Music
  if (r.apple_music?.id) {
    const storefront = r.apple_music.country || "US";
    const url = r.apple_music.url || `https://music.apple.com/${storefront.toLowerCase()}/song/${r.title}/${r.apple_music.id}`;
    const h = {
      platform: "apple" as const,
      platform_id: String(r.apple_music.id),
      title: r.apple_music.name || r.title,
      artist: r.apple_music.artistName,
      duration_ms: r.apple_music.durationInMillis,
      isrc: r.apple_music.isrc || r.isrc,
      url,
    };
    const confidence = scoreMatch(meta, h);
    if (confidence >= 0.9) hits.push({ platform: "apple", platform_id: h.platform_id, url_web: url, url_app: url, storefront, confidence });
  }

  // (Optional) Deezer via AudD → you can map to ytmusic/tidal later if needed

  return hits;
}
