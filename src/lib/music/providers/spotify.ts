import { SmartLinkRequest, ProviderResult } from '../types';
import { scoreTrackMatch } from '../normalize';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search';

async function getSpotifyAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const body = new URLSearchParams({ grant_type: 'client_credentials' });

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) throw new Error('Failed to get Spotify token');
  const data = await res.json();
  return data.access_token as string;
}

export async function fetchFromSpotify(
  req: SmartLinkRequest,
  clientId?: string,
  clientSecret?: string
): Promise<ProviderResult | null> {
  if (!clientId || !clientSecret) {
    return null;
  }

  const token = await getSpotifyAccessToken(clientId, clientSecret);

  const q = req.isrc
    ? `isrc:${req.isrc}`
    : `track:${req.title} artist:${req.artist}`;

  const url = `${SPOTIFY_SEARCH_URL}?type=track&limit=5&q=${encodeURIComponent(q)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const data = await res.json();
  const items = data.tracks?.items || [];
  if (!items.length) return null;

  let best: ProviderResult | null = null;

  for (const item of items) {
    const artists = (item.artists || []).map((a: any) => a.name || '');
    const score =
      req.isrc && item.external_ids?.isrc === req.isrc
        ? 1
        : scoreTrackMatch(req.artist, req.title, artists, item.name || '');

    if (score < 0.6) continue;

    if (!best || score > best.confidence) {
      best = {
        provider: 'spotify',
        id: item.id,
        url: `https://open.spotify.com/track/${item.id}`,
        confidence: score,
      };
    }
  }

  return best;
}
