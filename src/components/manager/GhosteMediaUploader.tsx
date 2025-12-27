import React, { useCallback, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export type GhosteMediaType = 'video' | 'image' | 'audio' | 'unknown';

type GhosteMediaUploaderProps = {
  label?: string;
  helperText?: string;
  bucket?: string;
  onUploaded?: (payload: {
    media_asset_id: string;
    url: string;
    path: string;
    type: GhosteMediaType;
    fileName: string;
    size: number;
  }) => void;
};

export const GhosteMediaUploader: React.FC<GhosteMediaUploaderProps> = ({
  label = 'Upload media for Ghoste AI',
  helperText = 'Drop your video, cover art, or audio here so Ghoste AI can use the real file for smart links and ads.',
  bucket = 'uploads',
  onUploaded,
}) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{
    media_asset_id: string;
    url: string;
    path: string;
    type: GhosteMediaType;
    fileName: string;
    size: number;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  function detectType(file: File): GhosteMediaType {
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'unknown';
  }

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];

      if (!user) {
        setError('You must be logged in to upload files');
        return;
      }

      setUploading(true);
      setError(null);

      try {
        // Validate file size (50MB limit)
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
          throw new Error('File size must be less than 50MB');
        }

        const fileType = detectType(file);

        // Step 1: Create media_assets row (status='uploading')
        const { data: mediaAsset, error: createError } = await supabase
          .from('media_assets')
          .insert({
            owner_user_id: user.id,
            kind: fileType,
            filename: file.name,
            mime: file.type,
            size: file.size,
            storage_bucket: bucket,
            storage_key: '', // Will update after upload
            status: 'uploading',
          })
          .select('id')
          .single();

        if (createError || !mediaAsset) {
          console.error('[GhosteMediaUploader] Failed to create media_assets row:', createError);
          setError('Failed to initialize upload. Please try again.');
          return;
        }

        const mediaAssetId = mediaAsset.id;
        console.log('[GhosteMediaUploader] Created media_asset:', mediaAssetId);

        // Step 2: Upload file using media_asset_id in path
        const ext = file.name.split('.').pop();
        const storageKey = `${user.id}/${mediaAssetId}.${ext ?? 'bin'}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(storageKey, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError || !uploadData) {
          console.error('[GhosteMediaUploader] Upload error:', uploadError);

          // Mark media_asset as failed
          await supabase
            .from('media_assets')
            .update({ status: 'failed' })
            .eq('id', mediaAssetId);

          setError('Upload failed. Please try again.');
          return;
        }

        // Step 3: Get public URL
        const { data: publicUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(uploadData.path);

        const publicUrl = publicUrlData.publicUrl;

        // Step 4: Update media_asset (status='ready')
        const { error: updateError } = await supabase
          .from('media_assets')
          .update({
            storage_key: uploadData.path,
            public_url: publicUrl,
            status: 'ready',
          })
          .eq('id', mediaAssetId);

        if (updateError) {
          console.error('[GhosteMediaUploader] Failed to update media_asset:', updateError);
          // Non-fatal - file is uploaded, just status not updated
        }

        console.log('[GhosteMediaUploader] Upload complete:', mediaAssetId);

        const info = {
          media_asset_id: mediaAssetId,
          url: publicUrl,
          path: uploadData.path,
          type: fileType,
          fileName: file.name,
          size: file.size,
        };

        // Background: Register for legacy ghoste-media-register (non-blocking)
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            fetch('/.netlify/functions/ghoste-media-register', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                media_asset_id: mediaAssetId,
                url: publicUrl,
                path: uploadData.path,
                type: fileType,
                fileName: file.name,
                size: file.size,
              }),
            }).catch(e => console.warn('[GhosteMediaUploader] Background register failed:', e));
          }
        } catch {
          // Ignore
        }

        setFileInfo(info);
        onUploaded?.(info);
      } catch (err: any) {
        console.error('[GhosteMediaUploader] exception', err);
        setError(err.message || 'Upload failed.');
      } finally {
        setUploading(false);
      }
    },
    [bucket, onUploaded, user]
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    handleFiles(e.dataTransfer.files);
  };

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const prettySize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-100">{label}</p>
          <p className="text-[11px] text-slate-400 max-w-md">{helperText}</p>
        </div>
        {fileInfo && (
          <button
            type="button"
            onClick={() => setFileInfo(null)}
            className="text-[11px] text-rose-300 hover:text-rose-200 transition-colors"
          >
            Remove file
          </button>
        )}
      </div>

      <div
        onClick={handleClick}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={`group rounded-2xl border border-dashed bg-[#020617] px-4 py-6 cursor-pointer transition-colors ${
          uploading
            ? 'opacity-60 border-slate-600'
            : 'border-slate-700 hover:border-indigo-500'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={onSelectFile}
          disabled={uploading}
        />

        {!fileInfo && (
          <div className="flex flex-col items-center justify-center gap-1 text-center">
            <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-300 text-lg">
              ⬆️
            </div>
            <p className="text-xs text-slate-100 font-medium">
              Drag & drop media here, or click to upload
            </p>
            <p className="text-[11px] text-slate-400">
              We'll store this securely and Ghoste AI will reuse it for smart links and ads.
            </p>
          </div>
        )}

        {fileInfo && (
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 border border-slate-700 overflow-hidden flex-shrink-0">
              {fileInfo.type === 'image' ? (
                <img
                  src={fileInfo.url}
                  alt={fileInfo.fileName}
                  className="h-full w-full object-cover"
                />
              ) : fileInfo.type === 'video' ? (
                <span className="text-sm text-indigo-300">🎬</span>
              ) : fileInfo.type === 'audio' ? (
                <span className="text-sm text-indigo-300">🎵</span>
              ) : (
                <span className="text-sm text-slate-300">📁</span>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-slate-100 truncate max-w-[220px]">
                {fileInfo.fileName}
              </span>
              <span className="text-[11px] text-slate-400">
                {fileInfo.type.toUpperCase()} • {prettySize(fileInfo.size)}
              </span>
              <span className="text-[11px] text-emerald-300 mt-0.5">
                File uploaded for Ghoste AI
              </span>
            </div>
          </div>
        )}
      </div>

      {uploading && (
        <p className="text-[11px] text-slate-400">Uploading your media…</p>
      )}
      {error && <p className="text-[11px] text-rose-300">{error}</p>}
    </div>
  );
};
