export const patterns = {
  spotify: /^https?:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+(\?.*)?$/i,
  apple:   /^https?:\/\/music\.apple\.com\/[a-z]{2}\/(album|song)\/.+\/\d+(\?i=\d+)?$/i,
  tidal:   /^https?:\/\/(www\.)?tidal\.com\/browse\/track\/\d+$/i,
  ytmusic: /^https?:\/\/music\.youtube\.com\/watch\?v=[\w-]{11}(&.*)?$/i,
  soundcloud: /^https?:\/\/(www\.)?soundcloud\.com\/[^/]+\/[^/]+$/i,
};

export type Platform = keyof typeof patterns;

export function detectPlatform(url: string): Platform | null {
  const u = url.trim();
  return (Object.keys(patterns) as Platform[]).find(p => patterns[p].test(u)) ?? null;
}

export function isCanonical(url: string): boolean {
  const p = detectPlatform(url);
  return !!p && patterns[p].test(url.trim());
}
