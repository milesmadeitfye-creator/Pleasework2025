import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

interface SpotifyArtist {
  id: string;
  name: string;
  images: Array<{ url: string; height: number; width: number }>;
  followers?: { total: number };
  genres?: string[];
  popularity?: number;
}

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Authorization required' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const query = event.queryStringParameters?.q || '';

    if (!query) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Search query required' }),
      };
    }

    // Verify user and get their Spotify token
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid authorization' }),
      };
    }

    // Get user's Spotify credentials
    const { data: credentials, error: credError } = await supabase
      .from('spotify_credentials')
      .select('access_token, token_expires_at')
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Spotify not connected' }),
      };
    }

    // Check if token is expired
    if (new Date(credentials.token_expires_at) < new Date()) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Spotify token expired' }),
      };
    }

    // Search Spotify for artists
    const searchUrl = new URL('https://api.spotify.com/v1/search');
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('type', 'artist');
    searchUrl.searchParams.append('limit', '10');

    const searchResponse = await fetch(searchUrl.toString(), {
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
      },
    });

    if (!searchResponse.ok) {
      const error = await searchResponse.text();
      console.error('Spotify search failed:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to search Spotify' }),
      };
    }

    const searchData = await searchResponse.json();
    const artists: SpotifyArtist[] = searchData.artists?.items || [];

    // Format results
    const results = artists.map(artist => ({
      id: artist.id,
      name: artist.name,
      image: artist.images?.[0]?.url || null,
      followers: artist.followers?.total || 0,
      genres: artist.genres || [],
      popularity: artist.popularity || 0,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ artists: results }),
    };
  } catch (error) {
    console.error('Error searching Spotify artists:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
