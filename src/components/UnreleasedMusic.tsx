import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { Upload, Music, Lock, Globe, Check, Trash2, X } from 'lucide-react';
import { uploadFileWithProgress } from '../lib/fileUpload';
import { ProActionButton } from './ProGate';
import { useToast } from './Toast';
import { UNRELEASED_AUDIO_BUCKET } from '../config/storage';
import { getUnreleasedAudioUrl } from '../lib/supabase/getUnreleasedAudioUrl';
import { TrackCard } from './unreleased/TrackCard';
import { TrackDetailsPanel } from './unreleased/TrackDetailsPanel';
import { StudioToolbar } from './unreleased/StudioToolbar';

interface UnreleasedTrack {
  id: string;
  title: string;
  artist_name: string;
  file_url: string;
  cover_art_url: string;
  description: string;
  is_public: boolean;
  password: string | null;
  share_link: string;
  plays: number;
  created_at: string;
  audioUrl?: string | null;
}

export default function UnreleasedMusic() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tracks, setTracks] = useState<UnreleasedTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'meta_ready' | 'draft'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('unreleased_view_mode') as 'grid' | 'list') || 'grid';
  });

  const [formData, setFormData] = useState({
    title: '',
    artist_name: '',
    description: '',
    is_public: true,
    password: '',
  });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverArtFile, setCoverArtFile] = useState<File | null>(null);
  const [audioUploadProgress, setAudioUploadProgress] = useState<number>(0);
  const [coverArtUploadProgress, setCoverArtUploadProgress] = useState<number>(0);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverArtInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      fetchTracks();
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('unreleased_view_mode', viewMode);
  }, [viewMode]);

  const fetchTracks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('unreleased_music')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (data) {
      const tracksWithUrls = await Promise.all(
        data.map(async (track) => ({
          ...track,
          audioUrl: await getUnreleasedAudioUrl(supabase, track.file_url),
        }))
      );
      setTracks(tracksWithUrls);
    }
    setLoading(false);
  };

  const filteredAndSortedTracks = useMemo(() => {
    let result = [...tracks];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (track) =>
          track.title.toLowerCase().includes(term) ||
          track.artist_name.toLowerCase().includes(term)
      );
    }

    if (activeFilter === 'meta_ready') {
      result = result.filter((track) => track.audioUrl && track.cover_art_url && track.share_link);
    } else if (activeFilter === 'draft') {
      result = result.filter((track) => !track.audioUrl || !track.cover_art_url);
    }

    if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === 'name') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    }

    return result;
  }, [tracks, searchTerm, activeFilter, sortBy]);

  const selectedTrack = useMemo(() => {
    return tracks.find((t) => t.id === selectedTrackId) || null;
  }, [tracks, selectedTrackId]);

  const generateSlug = (title: string) => {
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `${baseSlug}-${randomStr}`;
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile || !user) return;

    if (!formData.title.trim() || !formData.artist_name.trim()) {
      showToast('Please provide title and artist name', 'warning');
      return;
    }

    setUploading(true);
    setAudioUploadProgress(0);
    setCoverArtUploadProgress(0);

    try {
      const slug = generateSlug(formData.title);
      const ext = audioFile.name.split('.').pop() || 'mp3';
      const audioPath = `${user.id}/unreleased/${Date.now()}_${audioFile.name}`;

      const audioStoragePath = await uploadFileWithProgress({
        bucket: UNRELEASED_AUDIO_BUCKET,
        file: audioFile,
        path: audioPath,
        onProgress: setAudioUploadProgress,
      });

      let coverArtStoragePath: string | null = null;
      if (coverArtFile) {
        const coverExt = coverArtFile.name.split('.').pop() || 'jpg';
        const coverPath = `${user.id}/unreleased-cover/${Date.now()}_${coverArtFile.name}`;

        coverArtStoragePath = await uploadFileWithProgress({
          bucket: UNRELEASED_AUDIO_BUCKET,
          file: coverArtFile,
          path: coverPath,
          onProgress: setCoverArtUploadProgress,
        });
      }

      console.log('[UnreleasedMusic] Audio storage path:', audioStoragePath, 'bucket:', UNRELEASED_AUDIO_BUCKET);
      console.log('[UnreleasedMusic] Cover storage path:', coverArtStoragePath, 'bucket:', UNRELEASED_AUDIO_BUCKET);

      const { data, error } = await supabase
        .from('unreleased_music')
        .insert([{
          user_id: user.id,
          title: formData.title.trim(),
          artist_name: formData.artist_name.trim(),
          file_url: audioStoragePath,
          cover_art_url: coverArtStoragePath || '',
          description: formData.description.trim(),
          is_public: formData.is_public,
          password: formData.is_public ? null : formData.password.trim() || null,
          share_link: slug,
          plays: 0,
        }])
        .select()
        .single();

      if (error) {
        console.error('[UnreleasedMusic] Database insert error:', error);
        showToast(`Failed to save track: ${error.message}`, 'error');
        setUploading(false);
        return;
      }

      if (data) {
        setTracks([data, ...tracks]);
        setShowUploadModal(false);
        resetForm();
        showToast('Track uploaded successfully! Your ghoste.one link is ready.', 'success');
      }
    } catch (err: any) {
      console.error('[UnreleasedMusic] Upload error:', err);
      showToast(err.message || 'Failed to upload audio file', 'error');
      setAudioUploadProgress(0);
      setCoverArtUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      artist_name: '',
      description: '',
      is_public: true,
      password: '',
    });
    setAudioFile(null);
    setCoverArtFile(null);
    setAudioUploadProgress(0);
    setCoverArtUploadProgress(0);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this track?')) return;

    const { error } = await supabase
      .from('unreleased_music')
      .delete()
      .eq('id', id);

    if (!error) {
      setTracks(tracks.filter(t => t.id !== id));
      if (selectedTrackId === id) {
        setSelectedTrackId(null);
      }
      showToast('Track deleted', 'success');
    }
  };

  const copyShareLink = (shareLink: string) => {
    const fullUrl = `https://ghoste.one/track/${shareLink}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(shareLink);
    showToast('Link copied to clipboard', 'success');
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const openTrackLink = (shareLink: string) => {
    window.open(`https://ghoste.one/track/${shareLink}`, '_blank');
  };

  return (
    <>
      <div className="space-y-6">
        {/* Premium header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
              Unreleased Music
            </h2>
            <p className="text-white/60 text-sm md:text-base">
              Store, preview, and prep your next drop.
            </p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-6 py-3 bg-[#1A6CFF] hover:bg-[#1557CC] text-white font-semibold rounded-xl transition-all hover:shadow-[0_0_24px_rgba(26,108,255,0.5)] flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Upload className="w-5 h-5" />
            Upload Track
          </button>
        </div>

        {/* Toolbar */}
        <StudioToolbar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
          viewMode={viewMode}
          onViewChange={setViewMode}
        />

        {/* Main content */}
        {loading ? (
          <LoadingSkeleton />
        ) : tracks.length === 0 ? (
          <EmptyState onUploadClick={() => setShowUploadModal(true)} />
        ) : filteredAndSortedTracks.length === 0 ? (
          <NoResultsState onClearFilters={() => { setSearchTerm(''); setActiveFilter('all'); }} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Track grid */}
            <div className="lg:col-span-7 xl:col-span-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredAndSortedTracks.map((track) => (
                  <TrackCard
                    key={track.id}
                    track={track}
                    isSelected={selectedTrackId === track.id}
                    onClick={() => setSelectedTrackId(track.id)}
                    onCopyLink={() => copyShareLink(track.share_link)}
                    onOpenLink={() => openTrackLink(track.share_link)}
                    onDelete={() => handleDelete(track.id)}
                  />
                ))}
              </div>
            </div>

            {/* Details panel */}
            <div className="lg:col-span-5 xl:col-span-4">
              {selectedTrack ? (
                <div className="sticky top-6 bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                  <TrackDetailsPanel
                    track={selectedTrack}
                    onCopyLink={() => copyShareLink(selectedTrack.share_link)}
                    onOpenLink={() => openTrackLink(selectedTrack.share_link)}
                    copiedLink={copiedLink === selectedTrack.share_link}
                  />
                </div>
              ) : (
                <div className="sticky top-6 bg-gradient-to-br from-white/[0.02] to-transparent backdrop-blur-sm border border-white/10 rounded-2xl p-12 text-center">
                  <Music className="w-16 h-16 text-white/10 mx-auto mb-4" />
                  <p className="text-white/40 text-sm">
                    Select a track to view details
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-[#0F1419] to-[#0A0F29] border border-white/10 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold text-white">Upload Track</h3>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  resetForm();
                }}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-white/60" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-white/80 mb-2">
                  Track Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-[#1A6CFF] focus:ring-2 focus:ring-[#1A6CFF]/20"
                  placeholder="My Unreleased Song"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/80 mb-2">
                  Artist Name *
                </label>
                <input
                  type="text"
                  value={formData.artist_name}
                  onChange={(e) => setFormData({ ...formData, artist_name: e.target.value })}
                  className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-[#1A6CFF] focus:ring-2 focus:ring-[#1A6CFF]/20"
                  placeholder="Your Artist Name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/80 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-[#1A6CFF] focus:ring-2 focus:ring-[#1A6CFF]/20 resize-none"
                  placeholder="Tell your fans about this track..."
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/80 mb-2">
                  Audio File *
                </label>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  className="w-full px-4 py-8 bg-black/40 border-2 border-dashed border-white/20 hover:border-[#1A6CFF] rounded-xl transition-all flex flex-col items-center gap-2"
                  disabled={uploading}
                >
                  <Music className="w-8 h-8 text-white/40" />
                  <span className="text-white/60 text-sm">
                    {audioFile ? audioFile.name : 'Click to upload audio file'}
                  </span>
                  <span className="text-xs text-white/40">MP3, WAV, or other audio formats</span>
                </button>
                {uploading && audioUploadProgress > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-white/60 mb-2">
                      <span>Uploading audio…</span>
                      <span>{audioUploadProgress}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-2 bg-gradient-to-r from-[#1A6CFF] to-[#00D4FF] transition-all"
                        style={{ width: `${audioUploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/80 mb-2">
                  Cover Art (Optional)
                </label>
                <input
                  ref={coverArtInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCoverArtFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => coverArtInputRef.current?.click()}
                  className="w-full px-4 py-6 bg-black/40 border-2 border-dashed border-white/20 hover:border-[#1A6CFF] rounded-xl transition-all flex flex-col items-center gap-2"
                  disabled={uploading}
                >
                  <Upload className="w-6 h-6 text-white/40" />
                  <span className="text-white/60 text-sm">
                    {coverArtFile ? coverArtFile.name : 'Click to upload cover art'}
                  </span>
                </button>
                {uploading && coverArtFile && coverArtUploadProgress > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-white/60 mb-2">
                      <span>Uploading cover art…</span>
                      <span>{coverArtUploadProgress}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-2 bg-gradient-to-r from-[#1A6CFF] to-[#00D4FF] transition-all"
                        style={{ width: `${coverArtUploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 pt-6 space-y-4">
                <label className="block text-sm font-semibold text-white/80 mb-4">
                  Privacy Settings
                </label>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-4 bg-black/40 border border-white/10 rounded-xl cursor-pointer hover:border-[#1A6CFF] transition-all">
                    <input
                      type="radio"
                      name="privacy"
                      checked={formData.is_public}
                      onChange={() => setFormData({ ...formData, is_public: true, password: '' })}
                      className="mt-0.5 w-4 h-4 accent-[#1A6CFF]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-semibold text-white mb-1">
                        <Globe className="w-4 h-4 text-emerald-400" />
                        Public
                      </div>
                      <p className="text-xs text-white/50">Anyone with the link can listen</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 bg-black/40 border border-white/10 rounded-xl cursor-pointer hover:border-[#1A6CFF] transition-all">
                    <input
                      type="radio"
                      name="privacy"
                      checked={!formData.is_public}
                      onChange={() => setFormData({ ...formData, is_public: false })}
                      className="mt-0.5 w-4 h-4 accent-[#1A6CFF]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-semibold text-white mb-1">
                        <Lock className="w-4 h-4 text-amber-400" />
                        Private (Password Protected)
                      </div>
                      <p className="text-xs text-white/50">Requires password to access</p>
                    </div>
                  </label>
                </div>

                {!formData.is_public && (
                  <div>
                    <label className="block text-sm font-semibold text-white/80 mb-2">
                      Password *
                    </label>
                    <input
                      type="text"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-[#1A6CFF] focus:ring-2 focus:ring-[#1A6CFF]/20"
                      placeholder="Enter password"
                      required={!formData.is_public}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false);
                    resetForm();
                  }}
                  disabled={uploading}
                  className="flex-1 px-6 py-3 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <ProActionButton
                  onClick={() => {
                    const form = document.querySelector('form');
                    if (form) {
                      const event = new Event('submit', { bubbles: true, cancelable: true });
                      form.dispatchEvent(event);
                    }
                  }}
                  feature="unreleased music"
                  disabled={uploading || !audioFile}
                  className="flex-1 px-6 py-3 bg-[#1A6CFF] hover:bg-[#1557CC] text-white font-semibold rounded-xl transition-all hover:shadow-[0_0_20px_rgba(26,108,255,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {uploading ? 'Uploading...' : 'Upload Track'}
                </ProActionButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 xl:col-span-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="bg-white/5 rounded-2xl p-4 animate-pulse"
            >
              <div className="aspect-square bg-white/10 rounded-xl mb-3" />
              <div className="h-4 bg-white/10 rounded mb-2" />
              <div className="h-3 bg-white/10 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
      <div className="lg:col-span-5 xl:col-span-4">
        <div className="sticky top-6 bg-white/5 rounded-2xl p-6 animate-pulse">
          <div className="aspect-square bg-white/10 rounded-2xl mb-4" />
          <div className="h-6 bg-white/10 rounded mb-2" />
          <div className="h-4 bg-white/10 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onUploadClick }: { onUploadClick: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center max-w-md">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#1A6CFF]/20 to-[#1A6CFF]/5 flex items-center justify-center mx-auto mb-6">
          <Music className="w-12 h-12 text-[#1A6CFF]" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-3">
          Drop your next release in here.
        </h3>
        <p className="text-white/60 mb-8 leading-relaxed">
          Upload unreleased tracks, demos, and works-in-progress. Share them privately or publicly with a secure ghoste.one link.
        </p>
        <button
          onClick={onUploadClick}
          className="px-8 py-4 bg-[#1A6CFF] hover:bg-[#1557CC] text-white font-semibold rounded-xl transition-all hover:shadow-[0_0_24px_rgba(26,108,255,0.5)] inline-flex items-center gap-2"
        >
          <Upload className="w-5 h-5" />
          Upload Your First Track
        </button>
      </div>
    </div>
  );
}

function NoResultsState({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
          <Music className="w-8 h-8 text-white/20" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          No tracks found
        </h3>
        <p className="text-white/50 mb-6">
          Try adjusting your search or filters
        </p>
        <button
          onClick={onClearFilters}
          className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}
