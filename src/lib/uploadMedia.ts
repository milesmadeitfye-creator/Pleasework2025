// Shared media upload helper for Ghoste Studio and other features
// Uploads files to Supabase Storage and returns public URL
import { supabase } from './supabase';

export interface UploadMediaOptions {
  file: File;
  bucket: string;
  folder?: string;
}

/**
 * Uploads a media file (video, audio, image) to Supabase Storage
 * Returns the public URL of the uploaded file
 */
export async function uploadMediaToSupabase(options: UploadMediaOptions): Promise<string> {
  const { file, bucket, folder = 'ghoste-studio' } = options;

  // Generate unique filename with original extension
  const ext = file.name.split('.').pop() || 'bin';
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).slice(2);
  const filePath = `${folder}/${timestamp}-${randomId}.${ext}`;

  console.log('[uploadMediaToSupabase] Uploading file', {
    name: file.name,
    size: file.size,
    type: file.type,
    path: filePath,
    bucket,
  });

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      upsert: false,
      cacheControl: '3600',
      contentType: file.type || undefined,
    });

  if (uploadError) {
    console.error('[uploadMediaToSupabase] Upload error', uploadError);
    throw new Error('UPLOAD_FAILED');
  }

  console.log('[uploadMediaToSupabase] File uploaded successfully');

  // Get public URL
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

  if (!data?.publicUrl) {
    console.error('[uploadMediaToSupabase] Failed to get public URL');
    throw new Error('PUBLIC_URL_FAILED');
  }

  console.log('[uploadMediaToSupabase] Public URL:', data.publicUrl);

  return data.publicUrl;
}
