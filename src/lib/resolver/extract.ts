import type { CoreMeta } from "./types";
import { detectPlatform } from "../linkPatterns";

const AUDD_ENDPOINT = "https://api.audd.io/";
const AUDD_API_TOKEN = "";

/**
 * Uses AudD to resolve core metadata (ISRC/title/artist/duration).
 * If your AudD plan includes ISRC on the enterprise endpoint, pass AUDD_ENDPOINT=https://enterprise.audd.io/
 * and make sure your token is enabled for ISRC.
 */
export async function extractCoreFromSeed(url: string): Promise<CoreMeta> {
  if (!detectPlatform(url)) throw new Error("Unsupported or non-canonical URL");
  const body = new URLSearchParams({
    api_token: AUDD_API_TOKEN,
    // Ask for platform bundles; AudD returns rich objects for these
    // (ISRC requires enterprise access per AudD docs).
    return: "apple_music,spotify,deezer",
    // Two useful params:
    //  - 'url' works when AudD can parse a direct streaming URL
    //  - fallback to 'itunes_country' if you want specific storefront shaping
    url,
  });

  const resp = await fetch(AUDD_ENDPOINT, { method: "POST", body });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`AudD HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  const json = await resp.json();

  if (!json?.result) {
    throw new Error(`AudD returned no result${json?.error ? `: ${json.error}` : ""}`);
  }

  const r = json.result;
  const isrc = r.isrc || r?.apple_music?.isrc || r?.spotify?.external_ids?.isrc || undefined;

  return {
    isrc,
    title: r.title || r?.spotify?.name || r?.apple_music?.name || "",
    artist: r.artist || r?.spotify?.artists?.map((a: any) => a.name).join(", ") || r?.apple_music?.artistName || "",
    album: r.album || r?.spotify?.album?.name || r?.apple_music?.albumName || undefined,
    duration_ms: r?.spotify?.duration_ms || r?.apple_music?.durationInMillis || undefined,
    release_date: r?.release_date || r?.spotify?.album?.release_date || r?.apple_music?.releaseDate || undefined,
  };
}
