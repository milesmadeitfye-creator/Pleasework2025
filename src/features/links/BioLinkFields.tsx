import React from 'react';
import type { BioLinkConfig, BioLinkHighlight } from '../../types/links';
import { User, Tag, Image, Link as LinkIcon, Plus, X, Music, Video, Share2 } from 'lucide-react';

type BioLinkFieldsProps = {
  value: BioLinkConfig;
  onChange: (config: BioLinkConfig) => void;
};

export function BioLinkFields({ value, onChange }: BioLinkFieldsProps) {
  const update = (field: keyof BioLinkConfig, val: any) => {
    onChange({ ...value, [field]: val });
  };

  const addHighlight = () => {
    const highlights = value.highlights || [];
    onChange({
      ...value,
      highlights: [...highlights, { label: '', url: '' }]
    });
  };

  const updateHighlight = (index: number, field: keyof BioLinkHighlight, val: string) => {
    const highlights = [...(value.highlights || [])];
    highlights[index] = { ...highlights[index], [field]: val };
    onChange({ ...value, highlights });
  };

  const removeHighlight = (index: number) => {
    const highlights = [...(value.highlights || [])];
    highlights.splice(index, 1);
    onChange({ ...value, highlights });
  };

  return (
    <div className="space-y-6">
      {/* Profile Info Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide border-b border-gray-800 pb-2">
          Profile Info
        </h3>

        {/* Display Name */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
            <User className="w-4 h-4" />
            Display Name *
          </label>
          <input
            type="text"
            value={value.displayName || ''}
            onChange={(e) => update('displayName', e.target.value)}
            placeholder="Your artist name"
            className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            required
          />
        </div>

        {/* Tagline */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
            <Tag className="w-4 h-4" />
            Tagline / Bio
          </label>
          <input
            type="text"
            value={value.tagline || ''}
            onChange={(e) => update('tagline', e.target.value)}
            placeholder="e.g., 'Hip-Hop Artist from Atlanta'"
            className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>

        {/* Avatar URL */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
            <Image className="w-4 h-4" />
            Avatar Image URL
          </label>
          <input
            type="url"
            value={value.avatarUrl || ''}
            onChange={(e) => update('avatarUrl', e.target.value || null)}
            placeholder="https://..."
            className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Primary Button Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide border-b border-gray-800 pb-2">
          Primary Button
        </h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
              <Tag className="w-4 h-4" />
              Button Label
            </label>
            <input
              type="text"
              value={value.primaryButtonLabel || ''}
              onChange={(e) => update('primaryButtonLabel', e.target.value)}
              placeholder="e.g., 'Listen Now'"
              className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
              <LinkIcon className="w-4 h-4" />
              Button URL
            </label>
            <input
              type="url"
              value={value.primaryButtonUrl || ''}
              onChange={(e) => update('primaryButtonUrl', e.target.value)}
              placeholder="https://..."
              className="w-full px-4 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Music Platforms Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide border-b border-gray-800 pb-2 flex items-center gap-2">
          <Music className="w-4 h-4" />
          Music Platforms
        </h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Spotify</label>
            <input
              type="url"
              value={value.spotifyUrl || ''}
              onChange={(e) => update('spotifyUrl', e.target.value)}
              placeholder="https://open.spotify.com/artist/..."
              className="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Apple Music</label>
            <input
              type="url"
              value={value.appleMusicUrl || ''}
              onChange={(e) => update('appleMusicUrl', e.target.value)}
              placeholder="https://music.apple.com/..."
              className="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">YouTube Music</label>
            <input
              type="url"
              value={value.youtubeUrl || ''}
              onChange={(e) => update('youtubeUrl', e.target.value)}
              placeholder="https://music.youtube.com/..."
              className="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">SoundCloud</label>
            <input
              type="url"
              value={value.soundcloudUrl || ''}
              onChange={(e) => update('soundcloudUrl', e.target.value)}
              placeholder="https://soundcloud.com/..."
              className="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Tidal</label>
            <input
              type="url"
              value={value.tidalUrl || ''}
              onChange={(e) => update('tidalUrl', e.target.value)}
              placeholder="https://tidal.com/..."
              className="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Social Media Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide border-b border-gray-800 pb-2 flex items-center gap-2">
          <Share2 className="w-4 h-4" />
          Social Media
        </h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">TikTok</label>
            <input
              type="url"
              value={value.tiktokUrl || ''}
              onChange={(e) => update('tiktokUrl', e.target.value)}
              placeholder="https://tiktok.com/@..."
              className="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-pink-400 focus:ring-1 focus:ring-pink-400 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Instagram</label>
            <input
              type="url"
              value={value.instagramUrl || ''}
              onChange={(e) => update('instagramUrl', e.target.value)}
              placeholder="https://instagram.com/..."
              className="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Twitter / X</label>
            <input
              type="url"
              value={value.twitterUrl || ''}
              onChange={(e) => update('twitterUrl', e.target.value)}
              placeholder="https://x.com/..."
              className="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Other</label>
            <input
              type="url"
              value={value.otherSocialUrl || ''}
              onChange={(e) => update('otherSocialUrl', e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Highlights Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-2">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
            Highlighted Links
          </h3>
          <button
            type="button"
            onClick={addHighlight}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 rounded-lg text-xs font-medium text-blue-400 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Link
          </button>
        </div>

        {(value.highlights || []).map((highlight, index) => (
          <div key={index} className="flex gap-2 items-start">
            <div className="flex-1 grid sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={highlight.label}
                onChange={(e) => updateHighlight(index, 'label', e.target.value)}
                placeholder="Label (e.g., 'Latest Album')"
                className="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              <input
                type="url"
                value={highlight.url}
                onChange={(e) => updateHighlight(index, 'url', e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-gray-900/80 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={() => removeHighlight(index)}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}

        {(!value.highlights || value.highlights.length === 0) && (
          <p className="text-sm text-gray-500 text-center py-4">
            Add highlighted links to feature your latest releases, merch store, or other important pages
          </p>
        )}
      </div>
    </div>
  );
}
