import { supabase } from './supabase';

/**
 * Upload creative to Supabase Storage and save metadata to ad_creatives table.
 *
 * This is the ONLY way to upload creatives - never send files to Netlify functions.
 *
 * @param file - File object from file input
 * @param userId - Current user ID
 * @param draftId - Campaign draft ID (for draft workflow)
 * @param campaignId - Published campaign ID (optional)
 * @param additionalMetadata - Optional ad copy and metadata
 * @returns Creative record from ad_creatives table
 */
export async function uploadCreative(
  file: File,
  userId: string,
  draftId?: string,
  campaignId?: string,
  additionalMetadata?: {
    headline?: string;
    primary_text?: string;
    description?: string;
    cta?: string;
    destination_url?: string;
  }
): Promise<{
  ok: boolean;
  creative?: any;
  error?: string;
  details?: string;
}> {
  try {
    // Validate inputs
    if (!file) {
      return { ok: false, error: 'No file provided' };
    }

    if (!userId) {
      return { ok: false, error: 'User ID required' };
    }

    // Determine creative type
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
      return {
        ok: false,
        error: 'Invalid file type',
        details: `Expected image or video, got ${file.type}`
      };
    }

    const creativeType = isVideo ? 'video' : 'image';

    console.log('[uploadCreative] Starting upload:', {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      creativeType,
      draftId,
      campaignId,
    });

    // Generate unique storage path
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${userId}/${timestamp}_${sanitizedName}`;

    // Upload to Supabase Storage (bucket: ad-assets, public access)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('ad-assets')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[uploadCreative] Storage upload failed:', uploadError);
      return {
        ok: false,
        error: 'Upload failed',
        details: uploadError.message,
      };
    }

    console.log('[uploadCreative] Storage upload successful:', uploadData.path);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('ad-assets')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    console.log('[uploadCreative] Public URL:', publicUrl);

    // Extract video duration if possible (for video files)
    let durationSeconds: number | null = null;
    if (isVideo) {
      try {
        durationSeconds = await getVideoDuration(file);
        console.log('[uploadCreative] Video duration:', durationSeconds, 'seconds');
      } catch (err) {
        console.warn('[uploadCreative] Could not extract video duration:', err);
      }
    }

    // Save metadata to ad_creatives table
    const { data: creativeData, error: dbError } = await supabase
      .from('ad_creatives')
      .insert([
        {
          owner_user_id: userId,
          draft_id: draftId || null,
          campaign_id: campaignId || null,
          creative_type: creativeType,
          storage_bucket: 'ad-assets',
          storage_path: storagePath,
          public_url: publicUrl,
          file_size_bytes: file.size,
          mime_type: file.type,
          duration_seconds: durationSeconds,
          headline: additionalMetadata?.headline || null,
          primary_text: additionalMetadata?.primary_text || null,
          description: additionalMetadata?.description || null,
          cta: additionalMetadata?.cta || null,
          destination_url: additionalMetadata?.destination_url || null,
          platform: 'meta',
        },
      ])
      .select()
      .single();

    if (dbError) {
      console.error('[uploadCreative] Database insert failed:', dbError);

      // Clean up uploaded file
      await supabase.storage.from('ad-assets').remove([storagePath]);

      return {
        ok: false,
        error: 'Failed to save creative metadata',
        details: dbError.message,
      };
    }

    console.log('[uploadCreative] Creative saved to database:', creativeData.id);

    return {
      ok: true,
      creative: creativeData,
    };
  } catch (err: any) {
    console.error('[uploadCreative] Unexpected error:', err);
    return {
      ok: false,
      error: 'Upload failed',
      details: err.message,
    };
  }
}

/**
 * Get video duration from a File object using HTMLVideoElement.
 * Returns duration in seconds, or null if unable to determine.
 */
async function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';

      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };

      video.onerror = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(null);
      };

      video.src = URL.createObjectURL(file);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Fetch creatives for a draft or campaign.
 *
 * @param userId - Current user ID
 * @param draftId - Campaign draft ID
 * @param campaignId - Published campaign ID (optional)
 * @returns Array of creative records
 */
export async function getCreatives(
  userId: string,
  draftId?: string,
  campaignId?: string
): Promise<{
  ok: boolean;
  creatives?: any[];
  error?: string;
}> {
  try {
    let query = supabase
      .from('ad_creatives')
      .select('*')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: true });

    if (draftId) {
      query = query.eq('draft_id', draftId);
    } else if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    } else {
      return { ok: false, error: 'Either draftId or campaignId required' };
    }

    const { data, error } = await query;

    if (error) {
      console.error('[getCreatives] Query failed:', error);
      return { ok: false, error: error.message };
    }

    return { ok: true, creatives: data || [] };
  } catch (err: any) {
    console.error('[getCreatives] Unexpected error:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Delete a creative (removes from storage and database).
 *
 * @param creativeId - Creative ID to delete
 * @param userId - Current user ID (for authorization)
 */
export async function deleteCreative(
  creativeId: string,
  userId: string
): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    // Fetch creative to get storage_path
    const { data: creative, error: fetchError } = await supabase
      .from('ad_creatives')
      .select('storage_path, storage_bucket, owner_user_id')
      .eq('id', creativeId)
      .single();

    if (fetchError || !creative) {
      return { ok: false, error: 'Creative not found' };
    }

    // Verify ownership
    if (creative.owner_user_id !== userId) {
      return { ok: false, error: 'Unauthorized' };
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from(creative.storage_bucket || 'ad-assets')
      .remove([creative.storage_path]);

    if (storageError) {
      console.error('[deleteCreative] Storage delete failed:', storageError);
      // Continue anyway - better to remove DB record
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('ad_creatives')
      .delete()
      .eq('id', creativeId)
      .eq('owner_user_id', userId);

    if (dbError) {
      console.error('[deleteCreative] Database delete failed:', dbError);
      return { ok: false, error: dbError.message };
    }

    console.log('[deleteCreative] Creative deleted:', creativeId);
    return { ok: true };
  } catch (err: any) {
    console.error('[deleteCreative] Unexpected error:', err);
    return { ok: false, error: err.message };
  }
}
