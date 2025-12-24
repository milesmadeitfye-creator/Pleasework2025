import type { LinkVariant } from "./types";

export async function resolveYouTubeMusic(
  artist: string,
  title: string,
  isrc?: string,
  knownLinks?: any
): Promise<LinkVariant | null> {
  try {
    const direct = knownLinks?.youtubeMusic || knownLinks?.youtube;

    if (direct && (direct.includes("youtube.com/watch") || direct.includes("youtu.be/"))) {
      const url = direct.includes("youtu.be/")
        ? new URL(`https://youtube.com/watch?v=${direct.split("/").pop()}`)
        : new URL(direct);
      const id = url.searchParams.get("v");
      if (id) {
        return {
          id,
          webUrl: `https://music.youtube.com/watch?v=${id}`,
          appSchemeUrl: `youtubemusic://watch?v=${id}`,
          confidence: 1,
        };
      }
    }

    const key = "";
    if (!key) return null;

    const q = encodeURIComponent(`${artist} ${title}`);
    const resp = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${q}&key=${key}`
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const best = (data.items || [])[0];
    if (!best?.id?.videoId) return null;

    const id = best.id.videoId;
    return {
      id,
      webUrl: `https://music.youtube.com/watch?v=${id}`,
      appSchemeUrl: `youtubemusic://watch?v=${id}`,
      confidence: 0.8,
    };
  } catch (err) {
    console.error("resolveYouTubeMusic error:", err);
    return null;
  }
}
