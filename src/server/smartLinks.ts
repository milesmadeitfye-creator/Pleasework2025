import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

export type SmartLinkRecord = {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  cover_image_url: string;
  spotify_url: string;
  apple_music_url: string;
  youtube_url: string;
  tidal_url: string;
  soundcloud_url: string;
  is_active: boolean;
  total_clicks: number;
  template: string;
  created_at: string;
};

function detectPlatformFromUrl(url: string): { field: string; url: string } | null {
  const urlLower = url.toLowerCase();

  if (urlLower.includes('spotify.com') || urlLower.includes('open.spotify')) {
    return { field: 'spotify_url', url };
  }
  if (urlLower.includes('music.apple.com') || urlLower.includes('itunes.apple.com')) {
    return { field: 'apple_music_url', url };
  }
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return { field: 'youtube_url', url };
  }
  if (urlLower.includes('tidal.com')) {
    return { field: 'tidal_url', url };
  }
  if (urlLower.includes('soundcloud.com')) {
    return { field: 'soundcloud_url', url };
  }

  return { field: 'spotify_url', url };
}

function extractSpotifyIdFromUrl(
  url: string
): { id: string; type: 'track' | 'album' | 'artist' | 'unknown' } {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('spotify.com')) return { id: '', type: 'unknown' };
    const parts = u.pathname.split('/').filter(Boolean);
    const type = parts[0] as any;
    const id = parts[1];
    if (!id) return { id: '', type: 'unknown' };

    if (type === 'track' || type === 'album' || type === 'artist') {
      return { id, type };
    }
    return { id, type: 'unknown' };
  } catch {
    return { id: '', type: 'unknown' };
  }
}

export async function createSmartLinkFromSpotifyForUser(args: {
  userId: string;
  spotifyUrl: string;
  title?: string;
}): Promise<SmartLinkRecord> {
  const { userId, spotifyUrl, title } = args;

  const parsed = extractSpotifyIdFromUrl(spotifyUrl);
  if (!parsed.id) {
    throw new Error('Invalid Spotify URL');
  }

  const titleFallback = title || 'New Smart Link';
  let slug = titleFallback.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const { data: existingLink } = await supabaseAdmin
    .from('smart_links')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existingLink) {
    slug = `${slug}-${Date.now()}`;
  }

  const linkData = {
    user_id: userId,
    title: titleFallback,
    slug,
    cover_image_url: '',
    spotify_url: spotifyUrl,
    apple_music_url: '',
    youtube_url: '',
    tidal_url: '',
    soundcloud_url: '',
    template: 'modern',
    color_scheme: {
      primary: '#3B82F6',
      secondary: '#1E40AF',
      background: '#000000',
      text: '#FFFFFF',
    },
    is_active: true,
    total_clicks: 0,
  };

  const { data, error } = await supabaseAdmin
    .from('smart_links')
    .insert(linkData)
    .select('*')
    .single();

  if (error || !data) {
    console.error('[smartLinks] createSmartLinkFromSpotifyForUser error', error);
    throw new Error('Failed to create smart link from Spotify');
  }

  return data as SmartLinkRecord;
}

export async function createSmartLink(args: {
  userId: string;
  title: string;
  slug?: string;
  spotifyUrl?: string;
  appleMusicUrl?: string;
  youtubeUrl?: string;
  tidalUrl?: string;
  soundcloudUrl?: string;
  url?: string;
  coverImageUrl?: string;
  template?: string;
}): Promise<SmartLinkRecord> {
  const {
    userId,
    title,
    slug,
    spotifyUrl,
    appleMusicUrl,
    youtubeUrl,
    tidalUrl,
    soundcloudUrl,
    url,
    coverImageUrl,
    template,
  } = args;

  let finalSlug = slug || title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const { data: existingLink } = await supabaseAdmin
    .from('smart_links')
    .select('id')
    .eq('slug', finalSlug)
    .maybeSingle();

  if (existingLink) {
    finalSlug = `${finalSlug}-${Date.now()}`;
  }

  let detectedPlatform: { field: string; url: string } | null = null;
  if (url && !spotifyUrl && !appleMusicUrl && !youtubeUrl && !tidalUrl && !soundcloudUrl) {
    detectedPlatform = detectPlatformFromUrl(url);
  }

  const linkData = {
    user_id: userId,
    title,
    slug: finalSlug,
    cover_image_url: coverImageUrl || '',
    spotify_url: spotifyUrl || (detectedPlatform?.field === 'spotify_url' ? detectedPlatform.url : ''),
    apple_music_url: appleMusicUrl || (detectedPlatform?.field === 'apple_music_url' ? detectedPlatform.url : ''),
    youtube_url: youtubeUrl || (detectedPlatform?.field === 'youtube_url' ? detectedPlatform.url : ''),
    tidal_url: tidalUrl || (detectedPlatform?.field === 'tidal_url' ? detectedPlatform.url : ''),
    soundcloud_url: soundcloudUrl || (detectedPlatform?.field === 'soundcloud_url' ? detectedPlatform.url : ''),
    template: template || 'modern',
    color_scheme: {
      primary: '#3B82F6',
      secondary: '#1E40AF',
      background: '#000000',
      text: '#FFFFFF',
    },
    is_active: true,
    total_clicks: 0,
  };

  const { data, error } = await supabaseAdmin
    .from('smart_links')
    .insert(linkData)
    .select('*')
    .single();

  if (error || !data) {
    console.error('[smartLinks] createSmartLink error', error);
    throw new Error('Failed to create smart link');
  }

  return data as SmartLinkRecord;
}

export async function listSmartLinksForUser(args: {
  userId: string;
  limit?: number;
}): Promise<SmartLinkRecord[]> {
  const { userId, limit = 20 } = args;

  const { data, error } = await supabaseAdmin
    .from('smart_links')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error('[smartLinks] listSmartLinksForUser error', error);
    throw new Error('Failed to list smart links');
  }

  return data as SmartLinkRecord[];
}
