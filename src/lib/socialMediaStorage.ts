import { supabase } from './supabase';

const SOCIAL_MEDIA_BUCKET = 'social_posts';

export interface UploadedAsset {
  bucket: string;
  path: string;
  mime_type: string;
  size_bytes: number;
}

/**
 * Uploads a file to Supabase Storage in the social-media bucket
 * @param file - The file to upload
 * @param userId - The user ID for path organization
 * @returns Metadata about the uploaded file
 */
export async function uploadSocialMediaFile(
  file: File,
  userId: string
): Promise<UploadedAsset> {
  try {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${userId}/${timestamp}_${randomStr}_${sanitizedName}`;

    console.log('[uploadSocialMediaFile] Uploading:', {
      path,
      size: file.size,
      type: file.type,
    });

    const { data, error } = await supabase.storage
      .from(SOCIAL_MEDIA_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('[uploadSocialMediaFile] Upload error:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    if (!data) {
      throw new Error('Upload succeeded but no data returned');
    }

    console.log('[uploadSocialMediaFile] Upload successful:', data.path);

    return {
      bucket: SOCIAL_MEDIA_BUCKET,
      path: data.path,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
    };
  } catch (error: any) {
    console.error('[uploadSocialMediaFile] Error:', error);
    throw error;
  }
}

/**
 * Gets a public URL for a file in social-media storage
 * @param path - The storage path
 * @returns Public URL
 */
export function getSocialMediaFileUrl(path: string): string {
  const { data } = supabase.storage
    .from(SOCIAL_MEDIA_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Deletes a file from social-media storage
 * @param path - The storage path to delete
 */
export async function deleteSocialMediaFile(path: string): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from(SOCIAL_MEDIA_BUCKET)
      .remove([path]);

    if (error) {
      console.error('[deleteSocialMediaFile] Delete error:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }

    console.log('[deleteSocialMediaFile] Deleted:', path);
  } catch (error: any) {
    console.error('[deleteSocialMediaFile] Error:', error);
    throw error;
  }
}
