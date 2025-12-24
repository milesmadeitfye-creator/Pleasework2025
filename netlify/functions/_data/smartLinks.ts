import type { SupabaseClient } from '@supabase/supabase-js';

export interface SmartLinkData {
  id: string;
  title: string;
  url: string;
  slug: string;
  platforms: {
    spotify: string | null;
    apple_music: string | null;
    youtube: string | null;
    youtube_music: string | null;
    tiktok: string | null;
    soundcloud: string | null;
    tidal: string | null;
    deezer: string | null;
    amazon_music: string | null;
  };
  created_at: string;
}

/**
 * Resolve a valid destination URL from a smart link's platform URLs
 * Falls back through available platforms and constructs ghoste.one URL if needed
 */
function resolveSmartLinkUrl(row: any): string {
  // Try platform URLs first (in order of popularity)
  if (row.spotify_url) return row.spotify_url;
  if (row.apple_music_url) return row.apple_music_url;
  if (row.youtube_url) return row.youtube_url;
  if (row.youtube_music_url) return row.youtube_music_url;
  if (row.tidal_url) return row.tidal_url;
  if (row.soundcloud_url) return row.soundcloud_url;
  if (row.deezer_url) return row.deezer_url;
  if (row.amazon_music_url) return row.amazon_music_url;

  // Fallback to ghoste.one URL if slug exists
  if (row.slug) return `https://ghoste.one/s/${row.slug}`;

  // Last resort: return empty string
  return '';
}

export async function listSmartLinksForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<SmartLinkData[]> {
  const { data, error } = await supabase
    .from('smart_links')
    .select('id, title, slug, spotify_url, apple_music_url, youtube_url, youtube_music_url, tidal_url, soundcloud_url, deezer_url, amazon_music_url, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[listSmartLinksForUser] Error:', error);
    throw new Error(`Failed to list smart links: ${error.message}`);
  }

  const links = (data || []).map((row: any) => ({
    id: row.id,
    title: row.title || row.slug || 'Untitled',
    slug: row.slug || '',
    url: resolveSmartLinkUrl(row),
    platforms: {
      spotify: row.spotify_url || null,
      apple_music: row.apple_music_url || null,
      youtube: row.youtube_url || null,
      youtube_music: row.youtube_music_url || null,
      tiktok: null, // Not in schema, kept for interface compatibility
      soundcloud: row.soundcloud_url || null,
      tidal: row.tidal_url || null,
      deezer: row.deezer_url || null,
      amazon_music: row.amazon_music_url || null,
    },
    created_at: row.created_at,
  }));

  return links;
}

export async function getSmartLink(
  supabase: SupabaseClient,
  userId: string,
  linkId: string
): Promise<SmartLinkData | null> {
  const { data, error } = await supabase
    .from('smart_links')
    .select('id, title, slug, spotify_url, apple_music_url, youtube_url, youtube_music_url, tidal_url, soundcloud_url, deezer_url, amazon_music_url, created_at')
    .eq('user_id', userId)
    .eq('id', linkId)
    .maybeSingle();

  if (error) {
    console.error('[getSmartLink] Error:', error);
    throw new Error(`Failed to get smart link: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    title: data.title || data.slug || 'Untitled',
    slug: data.slug || '',
    url: resolveSmartLinkUrl(data),
    platforms: {
      spotify: data.spotify_url || null,
      apple_music: data.apple_music_url || null,
      youtube: data.youtube_url || null,
      youtube_music: data.youtube_music_url || null,
      tiktok: null, // Not in schema, kept for interface compatibility
      soundcloud: data.soundcloud_url || null,
      tidal: data.tidal_url || null,
      deezer: data.deezer_url || null,
      amazon_music: data.amazon_music_url || null,
    },
    created_at: data.created_at,
  };
}
