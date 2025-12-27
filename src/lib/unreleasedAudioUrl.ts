import { supabase } from '@/lib/supabase.client';
import { UNRELEASED_BUCKET } from '../config/storage';

export interface UnreleasedTrack {
  audio_url?: string | null;
  file_url?: string | null;
  audio_path?: string | null;
}

// NOTE: This file is deprecated in favor of using UNRELEASED_BUCKET directly.
// It's kept for backward compatibility but new code should import UNRELEASED_BUCKET
// from '../config/storage' instead.

export function getUnreleasedTrackAudioUrl(track: UnreleasedTrack): string | null {
  // 1) Prefer explicit file_url if present and is a full URL
  if (track.file_url) {
    if (track.file_url.startsWith('http://') || track.file_url.startsWith('https://')) {
      return track.file_url;
    }
    // If file_url exists but is not a full URL, use getPublicUrl
    const { data } = supabase.storage.from(UNRELEASED_BUCKET).getPublicUrl(track.file_url);
    return data?.publicUrl ?? null;
  }

  // 2) Try audio_url
  if (track.audio_url) {
    if (track.audio_url.startsWith('http://') || track.audio_url.startsWith('https://')) {
      return track.audio_url;
    }
    const { data } = supabase.storage.from(UNRELEASED_BUCKET).getPublicUrl(track.audio_url);
    return data?.publicUrl ?? null;
  }

  // 3) Fallback: build from audio_path for public bucket
  if (track.audio_path) {
    const { data } = supabase.storage.from(UNRELEASED_BUCKET).getPublicUrl(track.audio_path);
    return data?.publicUrl ?? null;
  }

  console.warn('[unreleasedAudioUrl] No valid audio URL found for track:', track);
  return null;
}

export function buildUnreleasedMusicPublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from(UNRELEASED_BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) {
    throw new Error('Failed to build public URL for unreleased music');
  }
  return data.publicUrl;
}
