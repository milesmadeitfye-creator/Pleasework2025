export function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/\(feat\.[^)]+\)/g, '')
    .replace(/\bfeat\.?|\bft\.?/g, '')
    .replace(/[\[\]()]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const as = new Set(a.split(' '));
  const bs = new Set(b.split(' '));
  if (!as.size || !bs.size) return 0;

  let intersect = 0;
  as.forEach(w => { if (bs.has(w)) intersect++; });

  const union = as.size + bs.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

export function scoreTrackMatch(
  requestedArtist: string,
  requestedTitle: string,
  resultArtists: string[],
  resultTitle: string
): number {
  const normReqArtist = normalize(requestedArtist);
  const normReqTitle = normalize(requestedTitle);
  const normResTitle = normalize(resultTitle);
  const normResArtists = resultArtists.map(normalize);

  const titleScore = similarity(normReqTitle, normResTitle);

  const artistScore = Math.max(
    ...normResArtists.map(a => similarity(normReqArtist, a)),
    0
  );

  return 0.6 * titleScore + 0.4 * artistScore;
}
