import { useState } from "react";
import { Upload, X, Loader } from "lucide-react";
import { supabase } from "../lib/supabase";

export interface CreativeSlot {
  index: number;
  file: File | null;
  storagePath?: string;
  publicUrl?: string;
  isUploading?: boolean;
  fileType?: string;
}

interface CreativeUploadSlotProps {
  creative: CreativeSlot;
  userId: string;
  campaignTempId: string;
  onChange: (creative: CreativeSlot) => void;
  onError: (error: string) => void;
}

export function CreativeUploadSlot({
  creative,
  userId,
  campaignTempId,
  onChange,
  onError,
}: CreativeUploadSlotProps) {
  const [dragActive, setDragActive] = useState(false);

  const handleFileSelect = async (file: File) => {
    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/quicktime"];
    if (!validTypes.includes(file.type)) {
      onError(`Invalid file type for Creative ${creative.index}. Please upload an image or video.`);
      return;
    }

    // Validate file size (100MB max)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      onError(`File too large for Creative ${creative.index}. Maximum size is 100MB.`);
      return;
    }

    // Start uploading
    onChange({
      ...creative,
      file,
      fileType: file.type,
      isUploading: true,
    });

    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `user/${userId}/ads/${campaignTempId}/${creative.index}-${Date.now()}.${ext}`;

      const { data, error } = await supabase.storage
        .from("ad-assets")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        console.error(`Failed to upload Creative ${creative.index}:`, error);
        onError(`Upload failed for Creative ${creative.index}: ${error.message}`);
        onChange({
          ...creative,
          file: null,
          isUploading: false,
        });
        return;
      }

      const { data: publicData } = supabase.storage
        .from("ad-assets")
        .getPublicUrl(path);

      // Register upload in media_assets table for AI access
      try {
        await supabase.from('media_assets').insert({
          owner_user_id: userId,
          kind: file.type.startsWith('video/') ? 'video' : 'image',
          filename: file.name,
          mime: file.type,
          storage_bucket: 'ad-assets',
          storage_key: data.path,
          public_url: publicData.publicUrl,
          size: file.size,
          status: 'ready',
        });
        console.log('[CreativeUploadSlot] Registered in media_assets');
      } catch (regErr) {
        console.error('[CreativeUploadSlot] Failed to register upload:', regErr);
      }

      onChange({
        ...creative,
        file,
        fileType: file.type,
        storagePath: data.path,
        publicUrl: publicData.publicUrl,
        isUploading: false,
      });
    } catch (err: any) {
      console.error(`Unexpected error uploading Creative ${creative.index}:`, err);
      onError(`Unexpected error for Creative ${creative.index}: ${err.message}`);
      onChange({
        ...creative,
        file: null,
        isUploading: false,
      });
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleRemove = () => {
    onChange({
      ...creative,
      file: null,
      storagePath: undefined,
      publicUrl: undefined,
      isUploading: false,
      fileType: undefined,
    });
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-300">
        Creative {creative.index}
        {creative.index === 1 && (
          <span className="ml-1 text-red-400">*</span>
        )}
        {creative.index > 1 && (
          <span className="ml-1 text-gray-500">(optional)</span>
        )}
      </label>

      {!creative.publicUrl ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragActive
              ? "border-blue-500 bg-blue-500/10"
              : "border-gray-700 hover:border-gray-600"
          } ${creative.isUploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          <input
            type="file"
            id={`creative-${creative.index}`}
            accept="image/*,video/*"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
            disabled={creative.isUploading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />

          {creative.isUploading ? (
            <div className="flex flex-col items-center justify-center space-y-2">
              <Loader className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm text-gray-400">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-2">
              <Upload className="h-8 w-8 text-gray-400" />
              <p className="text-sm text-gray-300">
                Drop an image or video, or click to browse
              </p>
              <p className="text-xs text-gray-500">
                PNG, JPG, GIF, WebP, MP4, MOV (max 100MB)
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="relative border border-gray-700 rounded-lg p-4 bg-gray-800/50">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">
                {creative.file?.name}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {creative.fileType?.startsWith("image/") ? "Image" : "Video"} •{" "}
                {creative.file && (creative.file.size / 1024 / 1024).toFixed(2)} MB
              </p>
              {creative.fileType?.startsWith("image/") && (
                <img
                  src={creative.publicUrl}
                  alt={`Creative ${creative.index}`}
                  className="mt-2 w-full h-32 object-cover rounded"
                />
              )}
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="ml-2 p-1 text-gray-400 hover:text-red-400 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
