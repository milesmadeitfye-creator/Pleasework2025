import React, { useCallback, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export type GhosteMediaType = 'video' | 'image' | 'audio' | 'unknown';

type GhosteMediaUploaderProps = {
  label?: string;
  helperText?: string;
  bucket?: string;
  onUploaded?: (payload: {
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

        const ext = file.name.split('.').pop();
        const path = `${user.id}/${crypto.randomUUID()}.${ext ?? 'bin'}`;

        const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
          cacheControl: '3600',
          upsert: false,
        });

        if (error || !data) {
          console.error('[GhosteMediaUploader] upload error', error);
          setError('Upload failed. Please try again.');
          return;
        }

        const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(data.path);

        const url = publicUrl.publicUrl;
        const type = detectType(file);

        const info = {
          url,
          path: data.path,
          type,
          fileName: file.name,
          size: file.size,
        };

        // Register media asset in database so Ghoste AI can use it
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await fetch('/.netlify/functions/ghoste-media-register', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                url: info.url,
                path: info.path,
                type: info.type,
                fileName: info.fileName,
                size: info.size,
              }),
            });
            console.log('[GhosteMediaUploader] Media registered for AI use');
          }
        } catch (regErr) {
          console.error('[GhosteMediaUploader] Failed to register media:', regErr);
          // Non-fatal - file is still uploaded, just not registered
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
