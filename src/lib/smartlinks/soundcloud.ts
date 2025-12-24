import type { LinkVariant } from "./types";

export async function resolveSoundCloud(
  artist: string,
  title: string,
  isrc?: string,
  knownLinks?: any
): Promise<LinkVariant | null> {
  try {
    const direct = knownLinks?.soundcloud;
    if (direct?.includes("soundcloud.com/")) {
      return {
        webUrl: direct,
        confidence: 1,
      };
    }

    return {
      webUrl: `https://soundcloud.com/search/sounds?q=${encodeURIComponent(`${artist} ${title}`)}`,
      confidence: 0.3,
    };
  } catch (err) {
    console.error("resolveSoundCloud error:", err);
    return null;
  }
}
