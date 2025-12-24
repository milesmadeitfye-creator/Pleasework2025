import { SupabaseClient } from '@supabase/supabase-js';
import { UNRELEASED_AUDIO_BUCKET } from '../../config/unreleasedAudio';

/**
 * Generate a signed URL for unreleased music audio playback.
 *
 * This is the SINGLE source of truth for building audio URLs.
 * Do NOT build URLs manually elsewhere.
 *
 * @param supabase - Supabase client instance
 * @param filePath - Storage path like "userId/unreleased/timestamp_filename.mp3"
 * @returns Signed URL string or null if failed
 */
export async function getUnreleasedAudioUrl(
  supabase: SupabaseClient,
  filePath: string | null | undefined
): Promise<string | null> {
  // Validate input
  if (!filePath) {
    console.error('[UnreleasedAudio] Missing filePath', { filePath });
    return null;
  }

  // Normalize path - remove leading slash if present
  const normalized = filePath.startsWith('/') ? filePath.slice(1) : filePath;

  if (!normalized) {
    console.error('[UnreleasedAudio] Empty path after normalization', { filePath, normalized });
    return null;
  }

  console.log('[UnreleasedAudio] Building URL', {
    bucket: UNRELEASED_AUDIO_BUCKET,
    filePath,
    normalized,
  });

  try {
    // Create a signed URL valid for 1 hour
    const { data, error } = await supabase.storage
      .from(UNRELEASED_AUDIO_BUCKET)
      .createSignedUrl(normalized, 60 * 60);

    if (error) {
      console.error('[UnreleasedAudio] Failed to create signed URL', {
        error: error.message,
        bucket: UNRELEASED_AUDIO_BUCKET,
        normalized,
      });
      return null;
    }

    if (!data?.signedUrl) {
      console.error('[UnreleasedAudio] No signed URL in response', {
        bucket: UNRELEASED_AUDIO_BUCKET,
        normalized,
        data,
      });
      return null;
    }

    console.log('[UnreleasedAudio] Signed URL created', {
      url: data.signedUrl,
      bucket: UNRELEASED_AUDIO_BUCKET,
      path: normalized,
    });

    return data.signedUrl;
  } catch (err) {
    console.error('[UnreleasedAudio] Unexpected error', {
      error: err,
      bucket: UNRELEASED_AUDIO_BUCKET,
      normalized,
    });
    return null;
  }
}
