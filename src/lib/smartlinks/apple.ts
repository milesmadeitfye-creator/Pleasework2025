import type { LinkVariant } from "./types";
import { calculateConfidence } from "./normalize";

export async function resolveAppleMusic(
  artist: string,
  title: string,
  isrc?: string,
  knownLinks?: any
): Promise<LinkVariant | null> {
  try {
    const direct = knownLinks?.appleMusic;
    if (direct?.includes("music.apple.com")) {
      return {
        webUrl: toGeoAppleUrl(direct),
        confidence: 1,
      };
    }

    const term = encodeURIComponent(`${artist} ${title}`);
    const resp = await fetch(
      `https://itunes.apple.com/search?term=${term}&entity=song&limit=10`
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const results: any[] = data.results || [];
    if (!results.length) return null;

    let best: any = null;
    let bestScore = 0;

    for (const t of results) {
      const isMatch = isrc && t.isrc && t.isrc === isrc;
      const score = calculateConfidence(
        artist,
        title,
        t.artistName || "",
        t.trackName || "",
        !!isMatch
      );
      if (score > bestScore) {
        best = t;
        bestScore = score;
      }
    }

    if (!best?.trackViewUrl) return null;

    return {
      id: String(best.trackId),
      webUrl: toGeoAppleUrl(best.trackViewUrl),
      confidence: bestScore,
    };
  } catch (err) {
    console.error("resolveAppleMusic error:", err);
    return null;
  }
}

function toGeoAppleUrl(url: string): string {
  if (!url.includes("music.apple.com")) return url;
  return url.replace("https://music.apple.com", "https://geo.music.apple.com");
}
