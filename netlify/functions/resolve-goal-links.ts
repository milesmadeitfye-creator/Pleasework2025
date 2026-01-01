/**
 * Auto-Resolve Goal Links
 *
 * Automatically resolves required URLs for ads goals from minimal inputs:
 * - Spotify track URL → Smart Link → PreSave
 * - Meta assets → Instagram profile URL
 * - Best-effort resolve for sound URLs (TikTok/Facebook)
 *
 * Eliminates manual URL pasting in ads workflows.
 */

import { Handler } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';
import { resolveMetaAssets } from './_resolveMetaAssets';
import { ensureSmartLinkFromUrlSafe } from './_smartLinkEnsure';

interface ResolveRequest {
  query?: {
    song?: string;
    artist?: string;
    spotify_url?: string;
  };
  goals?: string[];
}

interface ResolvedLinks {
  spotify_track_url?: string;
  spotify_track_id?: string;
  smart_link_url?: string;
  presave_link_url?: string;
  instagram_profile_url?: string;
  tiktok_sound_url?: string;
  facebook_sound_url?: string;
  lead_form_url?: string;
  resolved_at?: string;
  source?: any;
}

interface ResolveResponse {
  ok: boolean;
  resolved: ResolvedLinks;
  missing?: Record<string, string>;
  error?: string;
}

/**
 * Extract Spotify track ID from various URL formats
 */
function extractSpotifyTrackId(url: string): string | null {
  if (!url) return null;

  // Handle spotify: URI format
  if (url.startsWith('spotify:track:')) {
    return url.split(':')[2];
  }

  // Handle open.spotify.com URLs
  const match = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Normalize Spotify URL to canonical format
 */
function normalizeSpotifyUrl(url: string): string {
  const trackId = extractSpotifyTrackId(url);
  if (!trackId) return url;
  return `https://open.spotify.com/track/${trackId}`;
}

/**
 * Search Spotify for track (fallback when URL not provided)
 */
async function searchSpotifyTrack(song: string, artist?: string): Promise<{
  spotify_url: string;
  spotify_id: string;
  title: string;
  artist: string;
  confidence: number;
} | null> {
  console.log('[searchSpotifyTrack] Searching for:', { song, artist });

  // This would require Spotify API credentials
  // For now, return null and require manual entry
  // TODO: Implement Spotify search API call when credentials available

  console.warn('[searchSpotifyTrack] Spotify search not yet implemented - user must provide URL');
  return null;
}

/**
 * Resolve Instagram profile URL from Meta assets
 */
async function resolveInstagramProfile(userId: string): Promise<string | null> {
  console.log('[resolveInstagramProfile] Resolving for user:', userId);

  try {
    const assets = await resolveMetaAssets(userId);

    if (!assets || !assets.instagram_actor_id) {
      console.log('[resolveInstagramProfile] No Instagram actor configured');
      return null;
    }

    // Fetch Instagram username from Meta Graph API
    const url = `https://graph.facebook.com/v21.0/${assets.instagram_actor_id}?fields=username&access_token=${assets.access_token}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error('[resolveInstagramProfile] Meta API error:', response.status);
      return null;
    }

    const data = await response.json();

    if (data.username) {
      const profileUrl = `https://instagram.com/${data.username}`;
      console.log('[resolveInstagramProfile] Resolved:', profileUrl);
      return profileUrl;
    }

    return null;
  } catch (error: any) {
    console.error('[resolveInstagramProfile] Error:', error.message);
    return null;
  }
}

/**
 * Resolve Facebook page URL from Meta assets
 */
async function resolveFacebookPage(userId: string): Promise<string | null> {
  console.log('[resolveFacebookPage] Resolving for user:', userId);

  try {
    const assets = await resolveMetaAssets(userId);

    if (!assets || !assets.page_id) {
      console.log('[resolveFacebookPage] No Facebook page configured');
      return null;
    }

    // Fetch page username from Meta Graph API
    const url = `https://graph.facebook.com/v21.0/${assets.page_id}?fields=username,link&access_token=${assets.access_token}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error('[resolveFacebookPage] Meta API error:', response.status);
      return null;
    }

    const data = await response.json();

    if (data.link) {
      console.log('[resolveFacebookPage] Resolved:', data.link);
      return data.link;
    } else if (data.username) {
      const pageUrl = `https://facebook.com/${data.username}`;
      console.log('[resolveFacebookPage] Resolved:', pageUrl);
      return pageUrl;
    }

    return null;
  } catch (error: any) {
    console.error('[resolveFacebookPage] Error:', error.message);
    return null;
  }
}

/**
 * Check for existing sound URLs in database
 */
async function findExistingSoundUrls(userId: string, spotifyTrackId: string): Promise<{
  tiktok_sound_url?: string;
  facebook_sound_url?: string;
} | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('track_sound_links')
    .select('tiktok_sound_url, facebook_sound_url')
    .eq('user_id', userId)
    .eq('spotify_track_id', spotifyTrackId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    tiktok_sound_url: data.tiktok_sound_url || undefined,
    facebook_sound_url: data.facebook_sound_url || undefined,
  };
}

/**
 * Check if release is upcoming (for presave eligibility)
 */
async function isUpcomingRelease(spotifyTrackId: string): Promise<boolean> {
  // TODO: Implement Spotify API call to check release date
  // For now, assume not upcoming (presave optional)
  return false;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Database not configured' }),
    };
  }

  const authHeader = event.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Missing authorization' }),
    };
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  let request: ResolveRequest;
  try {
    request = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  try {
    console.log('[resolve-goal-links] Starting resolution for user:', user.id);
    console.log('[resolve-goal-links] Query:', request.query);
    console.log('[resolve-goal-links] Goals:', request.goals);

    const resolved: ResolvedLinks = {
      resolved_at: new Date().toISOString(),
      source: {},
    };
    const missing: Record<string, string> = {};

    // Step 1: Resolve Spotify track
    let spotifyTrackId: string | null = null;
    let spotifyTrackUrl: string | null = null;

    if (request.query?.spotify_url) {
      // User provided Spotify URL
      spotifyTrackUrl = normalizeSpotifyUrl(request.query.spotify_url);
      spotifyTrackId = extractSpotifyTrackId(spotifyTrackUrl);

      if (spotifyTrackId) {
        resolved.spotify_track_url = spotifyTrackUrl;
        resolved.spotify_track_id = spotifyTrackId;
        resolved.source.spotify = 'provided_url';
        console.log('[resolve-goal-links] Spotify track resolved from URL:', spotifyTrackId);
      } else {
        console.warn('[resolve-goal-links] Invalid Spotify URL:', request.query.spotify_url);
        missing.spotify_track_url = 'Invalid Spotify URL format';
      }
    } else if (request.query?.song) {
      // Try to search Spotify
      const searchResult = await searchSpotifyTrack(
        request.query.song,
        request.query.artist
      );

      if (searchResult) {
        resolved.spotify_track_url = searchResult.spotify_url;
        resolved.spotify_track_id = searchResult.spotify_id;
        resolved.source.spotify = 'search';
        spotifyTrackId = searchResult.spotify_id;
        spotifyTrackUrl = searchResult.spotify_url;
        console.log('[resolve-goal-links] Spotify track resolved from search:', spotifyTrackId);
      } else {
        console.warn('[resolve-goal-links] Could not find Spotify track');
        missing.spotify_track_url = 'Please provide Spotify URL manually';
      }
    } else {
      console.warn('[resolve-goal-links] No Spotify input provided');
      missing.spotify_track_url = 'Please provide song name or Spotify URL';
    }

    // Step 2: Create/ensure smart link (if we have Spotify URL)
    if (spotifyTrackUrl) {
      try {
        const smartLink = await ensureSmartLinkFromUrlSafe(
          user.id,
          spotifyTrackUrl,
          request.query?.song || 'Auto-created Link'
        );

        if (smartLink.slug) {
          resolved.smart_link_url = `https://ghoste.one/s/${smartLink.slug}`;
          resolved.source.smart_link = 'created';
          console.log('[resolve-goal-links] Smart link resolved:', resolved.smart_link_url);
        } else {
          // Fallback to raw Spotify URL
          resolved.smart_link_url = spotifyTrackUrl;
          resolved.source.smart_link = 'fallback';
          console.log('[resolve-goal-links] Smart link fallback to Spotify URL');
        }
      } catch (error: any) {
        console.error('[resolve-goal-links] Smart link creation failed:', error.message);
        resolved.smart_link_url = spotifyTrackUrl; // Fallback
        resolved.source.smart_link = 'fallback';
      }
    }

    // Step 3: Check if presave applicable (upcoming release)
    if (spotifyTrackId && spotifyTrackUrl) {
      const isUpcoming = await isUpcomingRelease(spotifyTrackId);

      if (isUpcoming) {
        // TODO: Create/ensure presave link
        // For now, mark as not implemented
        missing.presave_link_url = 'Presave creation not yet implemented';
      } else {
        resolved.source.presave = 'not_applicable_released';
        console.log('[resolve-goal-links] Presave not applicable (track already released)');
      }
    }

    // Step 4: Resolve Instagram profile URL
    if (request.goals?.includes('followers') || request.goals?.includes('virality')) {
      const instagramUrl = await resolveInstagramProfile(user.id);

      if (instagramUrl) {
        resolved.instagram_profile_url = instagramUrl;
        resolved.source.instagram = 'meta_assets';
        console.log('[resolve-goal-links] Instagram profile resolved:', instagramUrl);
      } else {
        missing.instagram_profile_url = 'Connect Instagram in Meta settings';
      }
    }

    // Step 5: Resolve Facebook page URL
    if (request.goals?.includes('virality')) {
      const facebookUrl = await resolveFacebookPage(user.id);

      if (facebookUrl) {
        resolved.source.facebook_page = facebookUrl;
        console.log('[resolve-goal-links] Facebook page resolved:', facebookUrl);
      }
    }

    // Step 6: Check for existing sound URLs
    if (spotifyTrackId && (request.goals?.includes('virality'))) {
      const soundUrls = await findExistingSoundUrls(user.id, spotifyTrackId);

      if (soundUrls?.tiktok_sound_url) {
        resolved.tiktok_sound_url = soundUrls.tiktok_sound_url;
        resolved.source.tiktok_sound = 'reused';
        console.log('[resolve-goal-links] TikTok sound URL reused from DB');
      } else {
        missing.tiktok_sound_url = 'Add manually (auto-resolve not yet available)';
      }

      if (soundUrls?.facebook_sound_url) {
        resolved.facebook_sound_url = soundUrls.facebook_sound_url;
        resolved.source.facebook_sound = 'reused';
        console.log('[resolve-goal-links] Facebook sound URL reused from DB');
      } else {
        missing.facebook_sound_url = 'Add manually (auto-resolve not yet available)';
      }
    }

    // Step 7: Lead form (if leadgen goal)
    if (request.goals?.includes('leadgen') || request.goals?.includes('audience')) {
      // TODO: Auto-create Meta lead form or reuse existing
      missing.lead_form_url = 'Lead form creation not yet implemented';
    }

    // Step 8: Persist resolved links to user_ads_modes
    console.log('[resolve-goal-links] Persisting resolved links to database...');

    const { data: currentSettings } = await supabase
      .from('user_ads_modes')
      .select('resolved_links')
      .eq('user_id', user.id)
      .maybeSingle();

    const existingResolved = currentSettings?.resolved_links || {};
    const mergedResolved = { ...existingResolved, ...resolved };

    const { error: upsertError } = await supabase
      .from('user_ads_modes')
      .upsert({
        user_id: user.id,
        resolved_links: mergedResolved,
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      console.error('[resolve-goal-links] Failed to persist:', upsertError);
      // Continue anyway - user still gets resolved links in response
    } else {
      console.log('[resolve-goal-links] Persisted resolved links successfully');
    }

    const response: ResolveResponse = {
      ok: true,
      resolved,
      missing: Object.keys(missing).length > 0 ? missing : undefined,
    };

    console.log('[resolve-goal-links] Resolution complete:', response);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('[resolve-goal-links] Error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Failed to resolve links',
      }),
    };
  }
};
