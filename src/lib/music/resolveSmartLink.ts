import { SmartLinkRequest, SmartLink, ProviderResult } from './types';
import { fetchFromSpotify } from './providers/spotify';
import { fetchFromAppleMusic } from './providers/apple';
import { fetchFromYouTube } from './providers/youtube';
import { createClient } from '@supabase/supabase-js';

const MATCH_THRESHOLD = 0.6;

export async function resolveSmartLink(
  req: SmartLinkRequest,
  supabaseUrl: string,
  supabaseKey: string,
  credentials: {
    spotifyClientId?: string;
    spotifyClientSecret?: string;
    appleMusicToken?: string;
    appleMusicStorefront?: string;
    youtubeApiKey?: string;
  }
): Promise<SmartLink> {
  if (!req.artist || !req.title) {
    throw new Error('artist and title are required');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const cached = await findExistingSmartLink(supabase, req);
  if (cached && !cached.needsManualReview) {
    return cached;
  }

  const [spotify, apple, youtube] = await Promise.all([
    fetchFromSpotify(req, credentials.spotifyClientId, credentials.spotifyClientSecret).catch(
      () => null
    ),
    fetchFromAppleMusic(
      req,
      credentials.appleMusicToken,
      credentials.appleMusicStorefront
    ).catch(() => null),
    fetchFromYouTube(req, credentials.youtubeApiKey).catch(() => null),
  ]);

  const providers = [spotify, apple, youtube].filter((p): p is ProviderResult => !!p);

  return saveSmartLink(supabase, req, providers, cached || undefined);
}

async function findExistingSmartLink(
  supabase: any,
  req: SmartLinkRequest
): Promise<SmartLink | null> {
  let query = supabase.from('smart_links').select('*').limit(1);

  if (req.isrc) {
    query = query.eq('isrc', req.isrc);
  } else {
    query = query.eq('artist', req.artist).eq('title', req.title);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as SmartLink;
}

async function saveSmartLink(
  supabase: any,
  req: SmartLinkRequest,
  providers: ProviderResult[],
  existing?: SmartLink
): Promise<SmartLink> {
  const by = (name: string) => providers.find(p => p.provider === name);

  const spotify = by('spotify');
  const apple = by('apple');
  const yt = by('youtube');

  const bestConfidence = Math.max(
    spotify?.confidence || 0,
    apple?.confidence || 0,
    yt?.confidence || 0,
    0
  );

  const needsManualReview = bestConfidence < MATCH_THRESHOLD;

  const payload: any = {
    artist: req.artist,
    title: req.title,
    isrc: req.isrc,
    spotify_track_id: spotify?.id,
    spotify_url: spotify?.url,
    apple_song_id: apple?.id,
    apple_url_geo: apple?.url,
    youtube_video_id: yt?.id,
    youtube_url: yt?.url,
    match_confidence: bestConfidence,
    needs_manual_review: needsManualReview,
  };

  if (existing) {
    const { data, error } = await supabase
      .from('smart_links')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return mapToSmartLink(data);
  } else {
    const { data, error } = await supabase
      .from('smart_links')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return mapToSmartLink(data);
  }
}

function mapToSmartLink(data: any): SmartLink {
  return {
    id: data.id,
    artist: data.artist,
    title: data.title,
    isrc: data.isrc,
    spotifyTrackId: data.spotify_track_id,
    spotifyUrl: data.spotify_url,
    appleSongId: data.apple_song_id,
    appleUrlGeo: data.apple_url_geo,
    youtubeVideoId: data.youtube_video_id,
    youtubeUrl: data.youtube_url,
    matchConfidence: data.match_confidence,
    needsManualReview: data.needs_manual_review,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
