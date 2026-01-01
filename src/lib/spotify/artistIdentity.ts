import { supabase } from '../supabase.client';

export interface ArtistIdentity {
  id: string;
  user_id: string;
  spotify_artist_id: string | null;
  spotify_artist_name: string | null;
  spotify_artist_image: string | null;
  songstats_artist_id: string | null;
  songstats_artist_name: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  image: string | null;
  followers: number;
  genres: string[];
  popularity: number;
}

/**
 * Get the primary artist identity for the current user
 */
export async function getPrimaryArtistIdentity(): Promise<ArtistIdentity | null> {
  try {
    const { data, error } = await supabase.rpc('get_primary_artist_identity');

    if (error) {
      console.error('Error fetching primary artist identity:', error);
      return null;
    }

    return data?.[0] || null;
  } catch (err) {
    console.error('Error in getPrimaryArtistIdentity:', err);
    return null;
  }
}

/**
 * Check if user has connected Spotify
 */
export async function hasSpotifyConnected(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('has_spotify_connected');

    if (error) {
      console.error('Error checking Spotify connection:', error);
      return false;
    }

    return data === true;
  } catch (err) {
    console.error('Error in hasSpotifyConnected:', err);
    return false;
  }
}

/**
 * Start Spotify OAuth flow
 */
export async function startSpotifyAuth(): Promise<string | null> {
  try {
    const response = await fetch('/.netlify/functions/spotify-artist-auth-start');

    if (!response.ok) {
      throw new Error('Failed to start Spotify auth');
    }

    const data = await response.json();

    // Store state for verification
    if (data.state) {
      sessionStorage.setItem('spotify_auth_state', data.state);
    }

    return data.authUrl;
  } catch (err) {
    console.error('Error starting Spotify auth:', err);
    return null;
  }
}

/**
 * Complete Spotify OAuth callback
 */
export async function completeSpotifyAuth(code: string, state: string): Promise<boolean> {
  try {
    // Verify state
    const storedState = sessionStorage.getItem('spotify_auth_state');
    if (storedState !== state) {
      console.error('State mismatch in Spotify OAuth');
      return false;
    }

    // Get user token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('No active session');
      return false;
    }

    const response = await fetch('/.netlify/functions/spotify-artist-auth-callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        state,
        userToken: session.access_token,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to complete Spotify auth');
    }

    // Clear state
    sessionStorage.removeItem('spotify_auth_state');

    return true;
  } catch (err) {
    console.error('Error completing Spotify auth:', err);
    return false;
  }
}

/**
 * Search for Spotify artists
 */
export async function searchSpotifyArtists(query: string): Promise<SpotifyArtist[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('No active session');
      return [];
    }

    const response = await fetch(
      `/.netlify/functions/spotify-artist-search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to search artists');
    }

    const data = await response.json();
    return data.artists || [];
  } catch (err) {
    console.error('Error searching Spotify artists:', err);
    return [];
  }
}

/**
 * Save selected Spotify artist as primary identity
 */
export async function saveSpotifyArtist(artist: SpotifyArtist): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return false;
    }

    // Set all existing identities to non-primary
    await supabase
      .from('artist_identities')
      .update({ is_primary: false })
      .eq('user_id', user.id);

    // Insert or update with new Spotify artist
    const { error } = await supabase
      .from('artist_identities')
      .upsert({
        user_id: user.id,
        spotify_artist_id: artist.id,
        spotify_artist_name: artist.name,
        spotify_artist_image: artist.image,
        is_primary: true,
      });

    if (error) {
      console.error('Error saving Spotify artist:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error in saveSpotifyArtist:', err);
    return false;
  }
}

/**
 * Link Songstats artist to existing identity
 */
export async function linkSongstatsArtist(
  songstatsArtistId: string,
  songstatsArtistName: string
): Promise<boolean> {
  try {
    const identity = await getPrimaryArtistIdentity();
    if (!identity) {
      console.error('No primary artist identity found');
      return false;
    }

    const { error } = await supabase
      .from('artist_identities')
      .update({
        songstats_artist_id: songstatsArtistId,
        songstats_artist_name: songstatsArtistName,
      })
      .eq('id', identity.id);

    if (error) {
      console.error('Error linking Songstats artist:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error in linkSongstatsArtist:', err);
    return false;
  }
}
