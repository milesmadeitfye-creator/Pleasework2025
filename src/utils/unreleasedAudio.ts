// src/utils/unreleasedAudio.ts
import { UNRELEASED_AUDIO_BUCKET } from '../config/storage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Build the public URL for an unreleased music audio file.
 *
 * This is the SINGLE source of truth for building audio URLs.
 * Do NOT build URLs manually elsewhere.
 *
 * @param audioPath - Storage path like "userId/unreleased/timestamp_filename.mp3"
 * @returns Full public URL or null if invalid
 */
export function getUnreleasedAudioUrl(audioPath?: string | null): string | null {
  if (!SUPABASE_URL || !audioPath) {
    console.warn('[getUnreleasedAudioUrl] Missing SUPABASE_URL or audioPath', { SUPABASE_URL, audioPath });
    return null;
  }

  // Legacy safety: if audioPath is already a full URL, just return it
  if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
    console.log('[getUnreleasedAudioUrl] audioPath is already a full URL:', audioPath);
    return audioPath;
  }

  // Normalize path - remove leading slash if present
  const normalizedPath = audioPath.startsWith('/') ? audioPath.substring(1) : audioPath;

  // Build public URL
  const url = `${SUPABASE_URL}/storage/v1/object/public/${UNRELEASED_AUDIO_BUCKET}/${normalizedPath}`;

  console.log('[getUnreleasedAudioUrl] Generated URL:', url, 'bucket:', UNRELEASED_AUDIO_BUCKET, 'audioPath:', audioPath);

  return url;
}
