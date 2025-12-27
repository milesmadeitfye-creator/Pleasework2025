import { Music, Globe, Lock, Eye, ExternalLink, Link2, Check, Play, Calendar, CheckCircle, XCircle } from 'lucide-react';
import { useState } from 'react';

interface TrackDetailsPanelProps {
  track: {
    id: string;
    title: string;
    artist_name: string;
    cover_art_url: string;
    file_url: string;
    description: string;
    is_public: boolean;
    plays: number;
    created_at: string;
    share_link: string;
    audioUrl?: string | null;
  };
  onCopyLink: () => void;
  onOpenLink: () => void;
  copiedLink: boolean;
}

export function TrackDetailsPanel({ track, onCopyLink, onOpenLink, copiedLink }: TrackDetailsPanelProps) {
  const [audioError, setAudioError] = useState(false);

  const hasAudio = !!track.audioUrl;
  const hasCoverArt = !!track.cover_art_url;
  const hasShareLink = !!track.share_link;
  const isMetaReady = hasAudio && hasCoverArt && hasShareLink;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="space-y-4">
          {/* Cover art */}
          <div className="aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-[#1A6CFF]/20 to-[#0A0F29]">
            {track.cover_art_url ? (
              <img
                src={track.cover_art_url}
                alt={track.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-20 h-20 text-white/10" />
              </div>
            )}
          </div>

          {/* Title & status */}
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">
              {track.title}
            </h2>
            <p className="text-white/60 mb-3">
              {track.artist_name}
            </p>

            {/* Status badge */}
            {track.is_public ? (
              <span className="inline-flex px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                Public
              </span>
            ) : (
              <span className="inline-flex px-3 py-1.5 bg-amber-500/20 text-amber-400 text-xs font-semibold rounded-full items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                Private
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={onCopyLink}
              className="flex-1 px-4 py-2.5 bg-[#1A6CFF] hover:bg-[#1557CC] text-white text-sm font-semibold rounded-xl transition-all hover:shadow-[0_0_20px_rgba(26,108,255,0.4)] flex items-center justify-center gap-2"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  Copy Link
                </>
              )}
            </button>
            <button
              onClick={onOpenLink}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Audio player */}
        {hasAudio && !audioError ? (
          <div className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <Play className="w-4 h-4 text-[#1A6CFF]" />
              <span className="text-sm font-medium text-white">Preview</span>
            </div>
            <audio
              controls
              className="w-full"
              preload="metadata"
              src={track.audioUrl}
              onError={() => setAudioError(true)}
              style={{
                height: '40px',
                borderRadius: '8px',
              }}
            />
          </div>
        ) : audioError ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <p className="text-red-400 text-sm">Audio file unavailable</p>
            <p className="text-red-300/60 text-xs mt-1">Check storage configuration</p>
          </div>
        ) : (
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-white/40 text-sm">No audio file uploaded</p>
          </div>
        )}

        {/* Description */}
        {track.description && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
              Description
            </h3>
            <p className="text-sm text-white/80 leading-relaxed">
              {track.description}
            </p>
          </div>
        )}

        {/* Readiness checklist */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
            Readiness
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              {hasAudio ? (
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-white/20 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">Audio uploaded</p>
                {!hasAudio && (
                  <p className="text-xs text-white/40">Upload an audio file</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              {hasCoverArt ? (
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-white/20 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">Artwork uploaded</p>
                {!hasCoverArt && (
                  <p className="text-xs text-white/40">Add cover art</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
              {hasShareLink ? (
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-white/20 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">Share link ready</p>
                {!hasShareLink && (
                  <p className="text-xs text-white/40">Link will be generated</p>
                )}
              </div>
            </div>

            {isMetaReady && (
              <div className="mt-4 p-4 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 rounded-xl">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-semibold text-sm">Meta Ready</span>
                </div>
                <p className="text-xs text-emerald-300/60 mt-1">
                  This track is ready for marketing campaigns
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
            Stats
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex items-center gap-2 text-white/40 mb-1">
                <Eye className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wide">Plays</span>
              </div>
              <p className="text-2xl font-bold text-white">{track.plays}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex items-center gap-2 text-white/40 mb-1">
                <Calendar className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wide">Created</span>
              </div>
              <p className="text-sm font-semibold text-white">
                {new Date(track.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Share link info */}
        {track.share_link && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
              Share Link
            </h3>
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-xs text-white/40 mb-1">ghoste.one link</p>
              <p className="text-sm text-[#1A6CFF] font-mono break-all">
                ghoste.one/track/{track.share_link}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
