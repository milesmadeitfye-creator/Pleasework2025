import { SmartLinkRequest, ProviderResult } from '../types';
import { scoreTrackMatch } from '../normalize';

const APPLE_SEARCH_URL = 'https://api.music.apple.com/v1/catalog';

export async function fetchFromAppleMusic(
  req: SmartLinkRequest,
  devToken?: string,
  storefront: string = 'us'
): Promise<ProviderResult | null> {
  if (!devToken) return null;

  const params = new URLSearchParams({
    term: req.isrc ? req.isrc : `${req.artist} ${req.title}`,
    types: 'songs',
    limit: '5',
  });

  const res = await fetch(
    `${APPLE_SEARCH_URL}/${storefront}/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${devToken}`,
      },
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  const items = data.results?.songs?.data || [];
  if (!items.length) return null;

  let best: ProviderResult | null = null;

  for (const item of items) {
    const attrs = item.attributes || {};
    const artists = attrs.artistName ? [attrs.artistName] : [];
    const score =
      req.isrc && attrs.isrc === req.isrc
        ? 1
        : scoreTrackMatch(req.artist, req.title, artists, attrs.name || '');

    if (score < 0.6) continue;

    let url: string = attrs.url || '';
    if (!url) continue;

    url = url.replace('https://music.apple.com', 'https://geo.music.apple.com');

    if (!best || score > best.confidence) {
      best = {
        provider: 'apple',
        id: item.id,
        url,
        confidence: score,
      };
    }
  }

  return best;
}
