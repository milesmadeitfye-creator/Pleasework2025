import { useState } from "react";
import { supabase } from "@/lib/supabase.client";
import { useAuth } from "../contexts/AuthContext";

type ManagerAssetUploadProps = {
  onUploaded?: (url: string) => void;
};

export function ManagerAssetUpload({ onUploaded }: ManagerAssetUploadProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!user) {
      setError("You must be logged in to upload files");
      return;
    }

    setError(null);
    setUploadedUrl(null);
    setUploading(true);

    try {
      // Validate file size (50MB limit)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        throw new Error("File size must be less than 50MB");
      }

      // Get file extension
      const ext = file.name.split(".").pop();

      // Create file path with user ID for organization and security
      const filePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

      // Upload to uploads bucket
      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("[ManagerAssetUpload] Upload error:", uploadError);
        throw new Error(uploadError.message || "Upload failed");
      }

      // Get public URL
      const { data } = supabase.storage
        .from("uploads")
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;
      setUploadedUrl(publicUrl);

      if (onUploaded) onUploaded(publicUrl);
    } catch (err: any) {
      console.error("[ManagerAssetUpload] Error:", err);
      setError(err.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/5 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-white">Upload media for Ghoste AI</span>
        {uploading && <span className="text-xs text-white/60">Uploading…</span>}
      </div>
      <p className="text-xs text-white/60">
        Drop your video, cover art, or audio here so Ghoste AI can use the real file
        for smart links and ads.
      </p>
      <label className="mt-1 inline-flex cursor-pointer items-center justify-center rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/15">
        {uploading ? "Uploading…" : "Choose file"}
        <input
          type="file"
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {uploadedUrl && (
        <div className="mt-2 rounded-lg bg-green-500/10 p-2">
          <p className="text-xs text-green-400">File uploaded successfully</p>
          <p className="mt-1 truncate text-xs text-white/60">{uploadedUrl}</p>
        </div>
      )}
    </div>
  );
}
