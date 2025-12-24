import type { Handler } from '@netlify/functions';

/**
 * Apple Music Track Lookup
 *
 * Parses Apple Music URLs and fetches track metadata using Apple Music API
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const handler: Handler = async (event) => {
  console.log('[apple-music-lookup] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }),
    };
  }

  try {
    const url = event.queryStringParameters?.url;

    if (!url) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'URL parameter required' }),
      };
    }

    console.log('[apple-music-lookup] Parsing URL:', url);

    const parsed = parseAppleMusicUrl(url);
    if (!parsed) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'INVALID_APPLE_MUSIC_URL',
          message: 'Could not parse Apple Music URL',
        }),
      };
    }

    const { trackId, storefront } = parsed;
    console.log('[apple-music-lookup] Parsed:', { trackId, storefront });

    const baseUrl = process.env.URL || 'https://ghoste.one';
    const tokenResponse = await fetch(`${baseUrl}/.netlify/functions/apple-music-token`);

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Apple Music token');
    }

    const { token } = await tokenResponse.json();

    const apiUrl = `https://api.music.apple.com/v1/catalog/${storefront}/songs/${trackId}`;
    const apiResponse = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!apiResponse.ok) {
      console.error('[apple-music-lookup] API error:', apiResponse.status);
      throw new Error(`Apple Music API error: ${apiResponse.status}`);
    }

    const apiData = await apiResponse.json();
    const song = apiData.data?.[0];

    if (!song) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'TRACK_NOT_FOUND',
          message: 'Track not found on Apple Music',
        }),
      };
    }

    const attributes = song.attributes;
    const artworkUrl = attributes.artwork?.url
      ? attributes.artwork.url.replace('{w}', '600').replace('{h}', '600')
      : null;

    const result = {
      apple_music_id: trackId,
      apple_music_url: url,
      title: attributes.name,
      artist: attributes.artistName,
      artwork: artworkUrl,
      storefront,
      albumName: attributes.albumName,
      releaseDate: attributes.releaseDate,
      isrc: attributes.isrc,
    };

    console.log('[apple-music-lookup] Success:', result.title);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    console.error('[apple-music-lookup] Error:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'LOOKUP_FAILED',
        message: error.message || 'Failed to lookup Apple Music track',
      }),
    };
  }
};

function parseAppleMusicUrl(url: string): { trackId: string; storefront: string } | null {
  try {
    const urlObj = new URL(url);

    if (!urlObj.hostname.includes('music.apple.com')) {
      return null;
    }

    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const storefront = pathParts[0] || 'us';

    const trackIdFromQuery = urlObj.searchParams.get('i');
    if (trackIdFromQuery) {
      return { trackId: trackIdFromQuery, storefront };
    }

    const lastSegment = pathParts[pathParts.length - 1];
    if (lastSegment && /^\d+$/.test(lastSegment)) {
      return { trackId: lastSegment, storefront };
    }

    return null;
  } catch (error) {
    console.error('[parseAppleMusicUrl] Parse error:', error);
    return null;
  }
}
