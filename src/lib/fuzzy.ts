function norm(s: string) {
  return s.toLowerCase()
    .replace(/\(feat\.[^)]+\)/g, '')
    .replace(/[\[\]()\-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function similarity(a: string, b: string) {
  const A = norm(a), B = norm(b);
  if (!A || !B) return 0;
  const as = new Set(A.split(' '));
  const bs = new Set(B.split(' '));
  let inter = 0;
  as.forEach(w => { if (bs.has(w)) inter++; });
  const denom = Math.max(as.size, bs.size);
  return denom ? inter / denom : 0;
}

export function scoreMatch(meta: {title:string; artist:string; duration_ms?:number}, hit: {title:string; artist:string; duration_ms?:number; isrc?:string}) {
  let score = 0;
  if (hit.isrc && hit.isrc.length >= 8) score += 0.8;
  score += similarity(meta.title, hit.title) * 0.12;
  score += similarity(meta.artist, hit.artist) * 0.08;
  if (meta.duration_ms && hit.duration_ms) {
    const diff = Math.abs(meta.duration_ms - hit.duration_ms);
    if (diff <= 2000) score += 0.05;
  }
  return Math.min(1, score);
}
