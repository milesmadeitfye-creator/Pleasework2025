import React, { useState, useEffect } from 'react';
import { Music } from 'lucide-react';

interface SpotifyLinkCardProps {
  initialUrl?: string | null;
  onSave: (url: string) => Promise<void> | void;
}

export const SpotifyLinkCard: React.FC<SpotifyLinkCardProps> = ({
  initialUrl,
  onSave,
}) => {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialUrl) setValue(initialUrl);
  }, [initialUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value?.trim()) return;

    try {
      setSaving(true);
      await onSave(value.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-white/8 bg-white/5 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-ghoste-blue/10 p-2 shadow-[0_0_18px_rgba(26,108,255,0.3)]">
            <Music className="w-5 h-5 text-ghoste-blue" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-ghoste-white">
              Spotify Artist Link
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-ghoste-grey">
              Paste your Spotify artist URL to auto-sync monthly listeners, followers, and popularity score.
            </p>
          </div>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 md:flex-row">
        <input
          type="text"
          placeholder="https://open.spotify.com/artist/..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded-xl border border-white/10 bg-ghoste-black/70 px-4 py-2.5 text-xs text-ghoste-white placeholder:text-ghoste-grey/50 focus:border-ghoste-blue focus:outline-none focus:ring-2 focus:ring-ghoste-blue/20 transition-all"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-ghoste-blue px-5 py-2.5 text-xs font-semibold text-ghoste-white shadow-[0_0_18px_rgba(26,108,255,0.5)] transition-all hover:bg-ghoste-blue/90 hover:shadow-[0_0_24px_rgba(26,108,255,0.7)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-ghoste-white border-t-transparent"></div>
              <span>Saving...</span>
            </>
          ) : (
            <span>Save & Refresh</span>
          )}
        </button>
      </form>
    </div>
  );
};
