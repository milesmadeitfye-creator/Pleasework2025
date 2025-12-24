import { SupabaseClient } from '@supabase/supabase-js';

/**
 * @deprecated This generic helper is NOT used for Unreleased Music.
 *
 * For Unreleased Music audio, use:
 *   import { getUnreleasedAudioUrl } from '@/utils/unreleasedAudio'
 *
 * This helper is a generic function that takes a bucket name as parameter.
 * It does NOT hardcode any bucket names.
 *
 * IMPORTANT: This uses getPublicUrl() which works for public buckets.
 * The bucket 'unreleased-music' is configured as public in migrations.
 *
 * @param bucketName - The storage bucket name (e.g., "unreleased-music")
 * @param filePath - The file path in the bucket (e.g., "userId/fileName.mp3")
 * @param supabase - Supabase client instance
 * @returns Public URL string or null if failed
 */
export async function getPublicAudioUrl(
  bucketName: string,
  filePath: string | null | undefined,
  supabase: SupabaseClient
): Promise<string | null> {
  // Validate inputs
  if (!bucketName) {
    console.error('[getPublicAudioUrl] Bucket name is required');
    return null;
  }

  if (!filePath) {
    console.error('[getPublicAudioUrl] File path is required');
    return null;
  }

  // Normalize path - remove leading slash if present
  const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;

  if (!normalizedPath) {
    console.error('[getPublicAudioUrl] File path is empty after normalization');
    return null;
  }

  try {
    // Verify bucket exists by attempting to list (lightweight check)
    const { error: bucketError } = await supabase.storage
      .from(bucketName)
      .list('', { limit: 1 });

    if (bucketError) {
      console.error(`[getPublicAudioUrl] Bucket "${bucketName}" error:`, bucketError.message);
      return null;
    }

    // Generate public URL
    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(normalizedPath);

    if (!data?.publicUrl) {
      console.error('[getPublicAudioUrl] Failed to generate public URL');
      return null;
    }

    console.log('[getPublicAudioUrl] Generated URL:', data.publicUrl);
    return data.publicUrl;

  } catch (err) {
    console.error('[getPublicAudioUrl] Unexpected error:', err);
    return null;
  }
}

/**
 * Synchronous version for when you already know the bucket is valid.
 * Use this in render functions where async/await isn't practical.
 *
 * @param bucketName - The storage bucket name
 * @param filePath - The file path in the bucket
 * @param supabase - Supabase client instance
 * @returns Public URL string or null if failed
 */
export function getPublicAudioUrlSync(
  bucketName: string,
  filePath: string | null | undefined,
  supabase: SupabaseClient
): string | null {
  if (!bucketName || !filePath) {
    return null;
  }

  // Normalize path - remove leading slash if present
  const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;

  if (!normalizedPath) {
    return null;
  }

  try {
    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(normalizedPath);

    return data?.publicUrl ?? null;
  } catch (err) {
    console.error('[getPublicAudioUrlSync] Error:', err);
    return null;
  }
}
