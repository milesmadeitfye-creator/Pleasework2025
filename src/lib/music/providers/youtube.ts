import { SmartLinkRequest, ProviderResult } from '../types';
import { scoreTrackMatch } from '../normalize';

const YT_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

export async function fetchFromYouTube(
  req: SmartLinkRequest,
  apiKey?: string
): Promise<ProviderResult | null> {
  if (!apiKey) return null;

  const query = `${req.artist} ${req.title} official audio`;

  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    part: 'snippet',
    maxResults: '5',
    type: 'video',
  });

  const res = await fetch(`${YT_SEARCH_URL}?${params.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  const items = data.items || [];
  if (!items.length) return null;

  let best: ProviderResult | null = null;

  for (const item of items) {
    const snippet = item.snippet || {};
    const videoTitle = snippet.title || '';
    const channelTitle = snippet.channelTitle || '';

    const score = scoreTrackMatch(req.artist, req.title, [channelTitle], videoTitle);

    if (score < 0.5) continue;

    const url = `https://www.youtube.com/watch?v=${item.id.videoId}`;
    if (!best || score > best.confidence) {
      best = {
        provider: 'youtube',
        id: item.id.videoId,
        url,
        confidence: score,
      };
    }
  }

  return best;
}
