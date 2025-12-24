import React, { useState } from 'react';
import type { PreSaveLinkConfig, PreSavePlatformConfig } from '../../types/links';
import { Calendar, Music, Image as ImageIcon, FileText, Upload, X, Loader2 } from 'lucide-react';
import { uploadMediaToSupabase } from '../../lib/uploadMedia';

type PreSaveLinkFieldsProps = {
  value: PreSaveLinkConfig;
  onChange: (config: PreSaveLinkConfig) => void;
};

export function PreSaveLinkFields({ value, onChange }: PreSaveLinkFieldsProps) {
  const config = value || {};
  const [uploadingCover, setUploadingCover] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);

  const update = <K extends keyof PreSaveLinkConfig>(
    key: K,
    val: PreSaveLinkConfig[K]
  ) => {
    onChange({ ...config, [key]: val });
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPG, PNG, or WebP)');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be smaller than 5MB');
      return;
    }

    setUploadingCover(true);
    try {
      const url = await uploadMediaToSupabase({
        file,
        bucket: 'uploads',
        folder: 'presave_covers',
      });
      update('coverImageUrl', url);
    } catch (error) {
      console.error('[PreSave] Cover upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploadingCover(false);
    }
  };

  const updatePlatform = (
    platform: 'spotify' | 'appleMusic' | 'tidal' | 'youtubeMusic' | 'deezer',
    partial: Partial<PreSavePlatformConfig>
  ) => {
    const current = config[platform] ?? { enabled: false };
    onChange({
      ...config,
      [platform]: { ...current, ...partial }
    });
  };

  const handleAppleMusicUrlChange = async (url: string) => {
    updatePlatform('appleMusic', { url });

    if (url && url.includes('music.apple.com')) {
      setLookupLoading(true);
      try {
        const response = await fetch(
          `/.netlify/functions/apple-music-lookup?url=${encodeURIComponent(url)}`
        );

        if (response.ok) {
          const data = await response.json();
          console.log('[PreSave] Apple Music lookup success:', data);

          if (!config.releaseTitle && data.title) {
            update('releaseTitle', data.title);
          }
          if (!config.coverImageUrl && data.artwork) {
            update('coverImageUrl', data.artwork);
          }
        } else {
          console.warn('[PreSave] Apple Music lookup failed:', await response.text());
        }
      } catch (error) {
        console.error('[PreSave] Apple Music lookup error:', error);
      } finally {
        setLookupLoading(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Release Info Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide border-b border-gray-800 pb-2">
          Release Information
        </h3>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Release Title */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
              <Music className="w-4 h-4" />
              Release Title *
            </label>
            <input
              type="text"
              value={config.releaseTitle || ''}
              onChange={(e) => update('releaseTitle', e.target.value)}
              placeholder="Song or album title"
              className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              required
            />
          </div>

          {/* Release Date */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
              <Calendar className="w-4 h-4" />
              Release Date *
            </label>
            <input
              type="date"
              value={config.releaseDateIso ? config.releaseDateIso.slice(0, 10) : ''}
              onChange={(e) =>
                update(
                  'releaseDateIso',
                  e.target.value ? new Date(e.target.value).toISOString() : undefined
                )
              }
              className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              required
            />
          </div>
        </div>

        {/* ISRC (Optional) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
            <Music className="w-4 h-4" />
            ISRC (Optional)
          </label>
          <input
            type="text"
            value={config.isrc || ''}
            onChange={(e) => update('isrc', e.target.value || undefined)}
            placeholder="US-ABC-24-00001"
            className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
          <p className="text-xs text-gray-500 mt-1.5">
            If you already have an ISRC, add it to improve platform matching
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
            <FileText className="w-4 h-4" />
            Description
          </label>
          <textarea
            value={config.description || ''}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Tell fans what's coming and why they should pre-save this release..."
            rows={3}
            className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none"
          />
        </div>

        {/* Cover Art Upload */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
            <ImageIcon className="w-4 h-4" />
            Cover Art
          </label>

          {config.coverImageUrl ? (
            <div className="space-y-2">
              <div className="relative rounded-lg overflow-hidden border border-gray-700 bg-gray-900/80">
                <img
                  src={config.coverImageUrl}
                  alt="Cover art preview"
                  className="w-full h-48 object-cover"
                />
                <button
                  type="button"
                  onClick={() => update('coverImageUrl', null)}
                  className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <label className="block">
                <span className="sr-only">Change cover art</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCoverUpload}
                  disabled={uploadingCover}
                  className="block w-full text-sm text-gray-400
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                    file:text-sm file:font-medium
                    file:bg-blue-600 file:text-white
                    hover:file:bg-blue-700
                    file:cursor-pointer cursor-pointer
                    file:transition-colors"
                />
              </label>
            </div>
          ) : (
            <label className="block cursor-pointer">
              <div className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-700 rounded-lg bg-gray-900/40 hover:bg-gray-900/60 transition-colors">
                {uploadingCover ? (
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-400">Uploading...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-500 mb-2" />
                    <p className="text-sm text-gray-400 mb-1">Click to upload cover art</p>
                    <p className="text-xs text-gray-500">JPG, PNG, or WebP (max 5MB)</p>
                  </>
                )}
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleCoverUpload}
                disabled={uploadingCover}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Library Actions Section (OAuth Pre-Save/Pre-Add) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2">
          <h3 className="text-sm font-semibold text-emerald-300 uppercase tracking-wide">
            Pre-Save / Pre-Add (OAuth)
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Auto-Save
            </span>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <PlatformRow
            label="Spotify Pre-Save"
            platform={config.spotify}
            color="bg-green-600"
            onToggle={(enabled) => updatePlatform('spotify', { enabled })}
            onUrlChange={(url) => updatePlatform('spotify', { url })}
            isOAuth={true}
            note="Fans connect Spotify - auto-saves on release"
          />
          <PlatformRow
            label="Apple Music Pre-Add"
            platform={config.appleMusic}
            color="bg-pink-600"
            onToggle={(enabled) => updatePlatform('appleMusic', { enabled })}
            onUrlChange={handleAppleMusicUrlChange}
            isOAuth={false}
            note="Paste Apple Music track URL (auto-lookup)"
            loading={lookupLoading}
          />
        </div>

        <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
          <p className="text-xs text-emerald-300/80">
            <strong>Forever Save:</strong> Fans who connect once will automatically save/add your future releases too (opt-in, enabled by default).
          </p>
        </div>
      </div>

      {/* One-Click Links Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-2">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
            One-Click Links
          </h3>
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-500">
              Direct platform links
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <PlatformRow
            label="Tidal"
            platform={config.tidal}
            color="bg-blue-600"
            onToggle={(enabled) => updatePlatform('tidal', { enabled })}
            onUrlChange={(url) => updatePlatform('tidal', { url })}
          />
          <PlatformRow
            label="YouTube Music"
            platform={config.youtubeMusic}
            color="bg-red-600"
            onToggle={(enabled) => updatePlatform('youtubeMusic', { enabled })}
            onUrlChange={(url) => updatePlatform('youtubeMusic', { url })}
          />
          <PlatformRow
            label="Deezer"
            platform={config.deezer}
            color="bg-purple-600"
            onToggle={(enabled) => updatePlatform('deezer', { enabled })}
            onUrlChange={(url) => updatePlatform('deezer', { url })}
          />
        </div>
      </div>

      {/* Email Capture (Always ON by default) */}
      <div className="p-4 bg-blue-500/5 border border-blue-500/30 rounded-xl">
        <div className="flex items-start gap-3">
          <input
            id="presave-capture-email"
            type="checkbox"
            checked={config.captureEmail !== false} // Default ON
            onChange={(e) => update('captureEmail', e.target.checked)}
            className="w-4 h-4 mt-0.5 rounded border-blue-500/50 bg-gray-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
          />
          <div className="flex-1">
            <label
              htmlFor="presave-capture-email"
              className="text-sm font-medium text-blue-300 cursor-pointer"
            >
              Collect fan emails (Recommended)
            </label>
            <p className="text-xs text-gray-400 mt-1">
              Capture email addresses to build your mailing list. Enabled by default.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformRow({
  label,
  platform,
  color,
  onToggle,
  onUrlChange,
  isOAuth = false,
  note,
  loading = false
}: {
  label: string;
  platform?: PreSavePlatformConfig;
  color: string;
  onToggle: (enabled: boolean) => void;
  onUrlChange: (url: string) => void;
  isOAuth?: boolean;
  note?: string;
  loading?: boolean;
}) {
  // For OAuth platforms (Spotify, Apple), default to enabled
  // For one-click links, default to enabled
  const enabled = platform?.enabled ?? (isOAuth ? true : true);
  const url = platform?.url ?? '';

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-black/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${enabled ? color : 'bg-gray-700'}`}></div>
          <span className="text-sm font-medium text-gray-100">{label}</span>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
            enabled
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
              : 'border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800'
          }`}
        >
          {isOAuth
            ? (enabled ? 'Active' : 'Off')
            : (enabled ? 'Active' : 'Off')}
        </button>
      </div>
      {enabled && !isOAuth && (
        <div className="relative">
          <input
            type="url"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder={`${label} track URL`}
            disabled={loading}
            className="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            </div>
          )}
        </div>
      )}
      {enabled && isOAuth && note && (
        <p className="text-xs text-green-400/80">{note}</p>
      )}
      {enabled && !isOAuth && (
        <p className="text-xs text-gray-500">Links will be generated automatically if left blank</p>
      )}
    </div>
  );
}
