import { Music, Globe, Lock, Eye, MoreVertical, Trash2, Link2, ExternalLink, Play } from 'lucide-react';
import { useState } from 'react';

interface TrackCardProps {
  track: {
    id: string;
    title: string;
    artist_name: string;
    cover_art_url: string;
    is_public: boolean;
    plays: number;
    created_at: string;
    share_link: string;
    audioUrl?: string | null;
    file_url: string;
  };
  isSelected: boolean;
  onClick: () => void;
  onCopyLink: () => void;
  onOpenLink: () => void;
  onDelete: () => void;
}

export function TrackCard({ track, isSelected, onClick, onCopyLink, onOpenLink, onDelete }: TrackCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      onClick={onClick}
      className={[
        'group relative bg-gradient-to-br from-white/[0.03] to-white/[0.01] backdrop-blur-sm',
        'border rounded-2xl p-4 cursor-pointer',
        'transition-all duration-300',
        isSelected
          ? 'border-[#1A6CFF] shadow-[0_0_24px_rgba(26,108,255,0.3)]'
          : 'border-white/10 hover:border-white/20 hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)]',
        'hover:-translate-y-1'
      ].join(' ')}
    >
      {/* Cover art */}
      <div className="relative aspect-square rounded-xl overflow-hidden mb-3 bg-gradient-to-br from-[#1A6CFF]/20 to-[#0A0F29]">
        {track.cover_art_url ? (
          <img
            src={track.cover_art_url}
            alt={track.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-12 h-12 text-white/20" />
          </div>
        )}

        {/* Status badge - top right */}
        <div className="absolute top-2 right-2">
          {track.is_public ? (
            <span className="px-2 py-1 bg-emerald-500/90 backdrop-blur-sm text-white text-[10px] font-semibold rounded-full flex items-center gap-1 shadow-lg">
              <Globe className="w-2.5 h-2.5" />
              PUBLIC
            </span>
          ) : (
            <span className="px-2 py-1 bg-amber-500/90 backdrop-blur-sm text-white text-[10px] font-semibold rounded-full flex items-center gap-1 shadow-lg">
              <Lock className="w-2.5 h-2.5" />
              PRIVATE
            </span>
          )}
        </div>

        {/* Play indicator on hover */}
        {track.audioUrl && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
            </div>
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="space-y-1 mb-3">
        <h3 className="font-semibold text-white text-sm line-clamp-1">
          {track.title}
        </h3>
        <p className="text-xs text-white/50 line-clamp-1">
          {track.artist_name}
        </p>
      </div>

      {/* Meta info */}
      <div className="flex items-center justify-between text-[11px] text-white/40">
        <div className="flex items-center gap-1">
          <Eye className="w-3 h-3" />
          <span>{track.plays}</span>
        </div>
        <span>{new Date(track.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      </div>

      {/* Action menu - desktop hover, mobile always visible */}
      <div className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 md:opacity-100 transition-opacity">
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition-colors"
          >
            <MoreVertical className="w-4 h-4 text-white" />
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                }}
              />
              <div className="absolute top-full left-0 mt-1 w-40 rounded-lg bg-[#0F1419] border border-white/10 shadow-xl z-50 overflow-hidden">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyLink();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-xs text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-2 transition-colors"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Copy Link
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLink();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-xs text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Link
                </button>
                <div className="border-t border-white/10" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
