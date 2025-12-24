import type { LinkVariant } from "./types";

export async function resolveTidal(
  artist: string,
  title: string,
  isrc?: string,
  knownLinks?: any
): Promise<LinkVariant | null> {
  try {
    const direct = knownLinks?.tidal;
    if (direct?.includes("tidal.com/track/")) {
      const id = direct.split("/track/")[1]?.split(/[?/]/)[0];
      if (id) {
        return {
          id,
          webUrl: `https://tidal.com/track/${id}`,
          appSchemeUrl: `tidal://track/${id}`,
          confidence: 1,
        };
      }
    }

    return {
      webUrl: `https://tidal.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`,
      confidence: 0.3,
    };
  } catch (err) {
    console.error("resolveTidal error:", err);
    return null;
  }
}
