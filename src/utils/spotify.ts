export type SpotifyEntity = {
  type: "track" | "album" | "playlist" | "artist" | "unknown";
  id?: string;
  openUrl?: string;
};

export function parseSpotifyUrl(input?: string | null): SpotifyEntity {
  if (!input) return { type: "unknown" };

  const url = input.trim();

  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const type = (parts[0] || "unknown") as SpotifyEntity["type"];
    const id = parts[1];

    if (!id || !["track", "album", "playlist", "artist"].includes(type)) {
      return { type: "unknown" };
    }

    return {
      type,
      id,
      openUrl: `https://open.spotify.com/${type}/${id}`,
    };
  } catch {
    return { type: "unknown" };
  }
}

export function isSpotifyUrl(url?: string | null) {
  if (!url) return false;
  return url.includes("open.spotify.com/");
}
