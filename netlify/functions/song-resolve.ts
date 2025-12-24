import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  external_ids?: { isrc?: string };
}

async function getSpotifyToken(): Promise<string | null> {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    console.warn('[song-resolve] Spotify credentials not configured');
    return null;
  }

  try {
    const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    const data: any = await response.json();
    return data.access_token || null;
  } catch (error) {
    console.error('[song-resolve] Spotify auth failed:', error);
    return null;
  }
}

async function resolveSpotifyUrl(url: string, token: string): Promise<SpotifyTrack | null> {
  const match = url.match(/track\/([a-zA-Z0-9]+)/);
  if (!match) return null;

  const trackId = match[1];
  const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) return null;
  return await response.json();
}

async function searchSpotify(query: string, token: string): Promise<SpotifyTrack | null> {
  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  if (!response.ok) return null;
  const data: any = await response.json();
  return data.tracks?.items?.[0] || null;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    const body = JSON.parse(event.body || "{}");
    const { input } = body;

    if (!input) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Input required" })
      };
    }

    const spotifyToken = await getSpotifyToken();
    if (!spotifyToken) {
      return {
        statusCode: 503,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Spotify integration not configured",
          message: "Please configure SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET"
        })
      };
    }

    let spotifyTrack: SpotifyTrack | null = null;

    if (input.includes('spotify.com')) {
      spotifyTrack = await resolveSpotifyUrl(input, spotifyToken);
    } else {
      spotifyTrack = await searchSpotify(input, spotifyToken);
    }

    if (!spotifyTrack) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Track not found" })
      };
    }

    const title = spotifyTrack.name;
    const artist = spotifyTrack.artists.map(a => a.name).join(', ');
    const isrc = spotifyTrack.external_ids?.isrc;

    const { data: existing } = await supabase
      .from('tracks')
      .select('*')
      .eq('owner_id', user.id)
      .eq('spotify_id', spotifyTrack.id)
      .maybeSingle();

    let track;
    if (existing) {
      const { data } = await supabase
        .from('tracks')
        .update({
          title,
          artist,
          isrc,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();
      track = data;
    } else {
      const { data } = await supabase
        .from('tracks')
        .insert([{
          owner_id: user.id,
          title,
          artist,
          isrc,
          spotify_id: spotifyTrack.id,
          metadata: { spotify: spotifyTrack }
        }])
        .select()
        .single();
      track = data;
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        track
      })
    };

  } catch (err: any) {
    console.error('[song-resolve] Error:', err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err?.message || "Internal server error"
      })
    };
  }
};
