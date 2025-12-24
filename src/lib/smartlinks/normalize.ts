import type { LinkVariant } from "./types";

export function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[''"]/g, "")
    .replace(/\(feat.*?\)/g, "")
    .trim();
}

export function calculateConfidence(
  reqArtist: string,
  reqTitle: string,
  foundArtist: string,
  foundTitle: string,
  isrcMatch: boolean
): number {
  if (isrcMatch) return 1;

  const na = normalize(reqArtist);
  const nt = normalize(reqTitle);
  const fa = normalize(foundArtist);
  const ft = normalize(foundTitle);

  const titleMatch = ft.includes(nt) || nt.includes(ft);
  const artistMatch = fa.includes(na) || na.includes(fa);

  if (titleMatch && artistMatch) return 0.95;
  if (titleMatch) return 0.7;
  if (artistMatch) return 0.5;
  return 0.3;
}

export function shouldShowLink(
  link: LinkVariant | null | undefined,
  threshold = 0.5
) {
  return !!link && link.confidence >= threshold && !!link.webUrl;
}
