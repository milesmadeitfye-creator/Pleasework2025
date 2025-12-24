import React from 'react';
import { Music2, ExternalLink } from 'lucide-react';

interface SmartLinkPreviewCardProps {
  title?: string;
  artist?: string;
  coverUrl?: string;
  status?: 'presave' | 'out-now';
  platforms?: Array<{
    id: string;
    label: string;
    url?: string;
  }>;
}

export const SmartLinkPreviewCard: React.FC<SmartLinkPreviewCardProps> = ({
  title = 'Untitled Release',
  artist = 'Artist Name',
  coverUrl,
  status = 'out-now',
  platforms = [
    { id: 'spotify', label: 'Listen on Spotify' },
    { id: 'apple', label: 'Listen on Apple Music' },
  ],
}) => {
  return (
    <div className="sticky top-20 flex justify-center">
      <div className="w-full max-w-xs">
        {/* Preview label */}
        <div className="mb-3 flex items-center justify-center gap-2">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-ghoste-grey">
            Live preview
          </span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* Phone mockup */}
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-ghoste-black/95 via-ghoste-navy/90 to-ghoste-black/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          {/* Cover */}
          <div className="mb-3 flex justify-center">
            <div className="relative h-32 w-32 overflow-hidden rounded-2xl border border-white/10 bg-ghoste-black/80 shadow-[0_12px_30px_rgba(0,0,0,0.8)]">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Music2 className="h-10 w-10 text-ghoste-grey/40" />
                </div>
              )}
            </div>
          </div>

          {/* Text */}
          <div className="mb-3 text-center">
            <p className="text-[10px] uppercase tracking-[0.16em] text-ghoste-grey">
              {status === 'presave' ? 'Pre-save' : 'Out now'}
            </p>
            <h2 className="mt-1 text-base font-semibold text-ghoste-white">
              {title}
            </h2>
            <p className="text-[11px] text-ghoste-grey">{artist}</p>
          </div>

          {/* Platform buttons */}
          <div className="space-y-2">
            {platforms.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-2 text-[11px] font-medium text-ghoste-white transition-colors hover:border-ghoste-blue/50 hover:bg-white/8"
              >
                <span className="truncate">{link.label}</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ghoste-blue/90 text-[10px] shadow-[0_0_16px_rgba(26,108,255,0.9)]">
                  <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            ))}
          </div>

          {/* Powered by badge */}
          <div className="mt-3 flex justify-center">
            <span className="rounded-full border border-white/8 bg-white/5 px-2 py-0.5 text-[9px] text-ghoste-grey">
              Powered by Ghoste
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
