import type { CoreMeta, ResolveHit } from "./types";
import { scoreMatch } from "../fuzzy";

const TIDAL_TOKEN = "";
const TIDAL_COUNTRY = "US";
const SOUNDCLOUD_CLIENT_ID = "";

export async function tidalFallback(meta: CoreMeta): Promise<ResolveHit[]> {
  if (!TIDAL_TOKEN) return [];
  if (!meta.title || !meta.artist) return [];

  const q = `${meta.title} ${meta.artist}`.trim();
  const url =
    `https://api.tidal.com/v1/search?query=${encodeURIComponent(q)}` +
    `&types=TRACKS&limit=5&countryCode=${encodeURIComponent(TIDAL_COUNTRY)}` +
    `&token=${encodeURIComponent(TIDAL_TOKEN)}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const json = (await resp.json().catch(() => null)) as any;
    const tracks = json?.tracks?.items ?? [];
    if (!Array.isArray(tracks) || tracks.length === 0) return [];

    const hits: ResolveHit[] = [];

    for (const tr of tracks) {
      const hitMeta = {
        title: tr.title as string,
        artist: Array.isArray(tr.artists)
          ? tr.artists.map((a: any) => a.name).join(", ")
          : tr.artist?.name ?? "",
        duration_ms:
          typeof tr.duration === "number" ? tr.duration * 1000 : undefined,
        isrc: tr.isrc,
      };
      const confidence = scoreMatch(meta, hitMeta);
      if (confidence < 0.9) continue;

      const id = String(tr.id);
      const url_web = `https://tidal.com/browse/track/${id}`;
      hits.push({
        platform: "tidal",
        platform_id: id,
        url_web,
        url_app: url_web,
        storefront: null,
        confidence,
      });
    }

    return hits;
  } catch (e) {
    console.warn("[tidalFallback] Error:", e);
    return [];
  }
}

export async function soundcloudFallback(
  meta: CoreMeta
): Promise<ResolveHit[]> {
  if (!SOUNDCLOUD_CLIENT_ID) return [];
  if (!meta.title || !meta.artist) return [];

  const q = `${meta.title} ${meta.artist}`.trim();
  const url =
    `https://api-v2.soundcloud.com/search/tracks` +
    `?q=${encodeURIComponent(q)}` +
    `&client_id=${encodeURIComponent(SOUNDCLOUD_CLIENT_ID)}` +
    `&limit=5`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const json = (await resp.json().catch(() => null)) as any;
    const tracks = json?.collection ?? [];
    if (!Array.isArray(tracks) || tracks.length === 0) return [];

    const hits: ResolveHit[] = [];

    for (const tr of tracks) {
      const hitMeta = {
        title: tr.title as string,
        artist: tr.user?.username as string,
        duration_ms:
          typeof tr.duration === "number" ? tr.duration : undefined,
        isrc: undefined,
      };
      const confidence = scoreMatch(meta, hitMeta);
      if (confidence < 0.9) continue;

      const url_web = tr.permalink_url as string;
      if (!url_web) continue;

      hits.push({
        platform: "soundcloud",
        platform_id: String(tr.id),
        url_web,
        url_app: url_web,
        storefront: null,
        confidence,
      });
    }

    return hits;
  } catch (e) {
    console.warn("[soundcloudFallback] Error:", e);
    return [];
  }
}
