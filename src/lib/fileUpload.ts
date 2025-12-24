import { supabase } from "./supabaseClient";

export type UploadProgressCallback = (progress: number) => void;

export async function uploadFileWithProgress(opts: {
  bucket: string;
  file: File;
  path: string;
  onProgress?: UploadProgressCallback;
}): Promise<string> {
  const { bucket, file, path, onProgress } = opts;

  // Start at 0 → 5%
  if (onProgress) onProgress(5);
  let current = 5;
  let timer: number | undefined;

  if (onProgress) {
    timer = window.setInterval(() => {
      // Fake progress until 95%; real completion will jump to 100%
      current = Math.min(current + 5, 95);
      onProgress(current);
    }, 250);
  }

  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: '3600',
    upsert: false,
  });

  if (timer) window.clearInterval(timer);

  if (error) {
    console.error("uploadFileWithProgress error", error);
    if (onProgress) onProgress(0);
    throw error;
  }

  if (!data || !data.path) {
    if (onProgress) onProgress(0);
    throw new Error("No path returned from storage upload");
  }

  // Final jump to 100%
  if (onProgress) onProgress(100);

  return data.path;
}
