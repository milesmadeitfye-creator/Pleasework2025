import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Upload, Music, Lock, Globe, Check, Trash2, Eye, Link2, ExternalLink, Play } from 'lucide-react';
import { uploadFileWithProgress } from '../lib/fileUpload';
import { ProActionButton } from './ProGate';
import { useToast } from './Toast';
import { UNRELEASED_AUDIO_BUCKET } from '../config/storage';
import { getUnreleasedAudioUrl } from '../lib/supabase/getUnreleasedAudioUrl';

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

      // Upload audio with progress
      const audioStoragePath = await uploadFileWithProgress({
        bucket: UNRELEASED_AUDIO_BUCKET,
        file: audioFile,
        path: audioPath,
        onProgress: setAudioUploadProgress,
      });

      // Upload cover art if provided
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

      // Insert into database with storage PATHS (not URLs)
      // The URLs will be generated on-demand using getPublicUrl()
      const { data, error } = await supabase
        .from('unreleased_music')
        .insert([{
          user_id: user.id,
          title: formData.title.trim(),
          artist_name: formData.artist_name.trim(),
          file_url: audioStoragePath, // Store path, not URL
          cover_art_url: coverArtStoragePath || '', // Store path, not URL
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
    }
  };

  const copyShareLink = (shareLink: string) => {
    const fullUrl = `https://ghoste.one/track/${shareLink}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(shareLink);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const openTrackLink = (shareLink: string) => {
    window.open(`https://ghoste.one/track/${shareLink}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Unreleased Music</h2>
          <p className="text-gray-400">Share your unreleased tracks privately or publicly</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          <Upload className="w-5 h-5" />
          Upload Track
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading tracks...</div>
      ) : tracks.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <Music className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No tracks uploaded yet</h3>
          <p className="text-gray-400 mb-6">Upload your first unreleased track to share with fans</p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors inline-flex items-center gap-2"
          >
            <Upload className="w-5 h-5" />
            Upload Track
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {tracks.map((track) => (
            <div key={track.id} className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-20 h-20 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                  {track.cover_art_url ? (
                    <img src={track.cover_art_url} alt={track.title} className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <Music className="w-8 h-8 text-gray-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-semibold mb-1">{track.title}</h3>
                      <p className="text-sm text-gray-400">{track.artist_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {track.is_public ? (
                        <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          Public
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-medium rounded-full flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          Private
                        </span>
                      )}
                    </div>
                  </div>

                  {track.description && (
                    <p className="text-gray-400 text-sm mb-3">{track.description}</p>
                  )}

                  {!track.audioUrl ? (
                    <div className="mb-4 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                      <p className="text-red-400 text-sm">Audio unavailable. Check storage path.</p>
                      <p className="text-red-300 text-xs mt-1">file_url: {track.file_url}</p>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <audio
                        controls
                        className="w-full"
                        preload="metadata"
                        src={track.audioUrl}
                        onError={(e) => {
                          console.error('[UnreleasedMusic] Audio error for track:', track.title);
                          console.error('[UnreleasedMusic] Audio URL:', track.audioUrl);
                          console.error('[UnreleasedMusic] Track id:', track.id, 'file_url:', track.file_url);
                        }}
                        onLoadedMetadata={() => {
                          console.log('[UnreleasedMusic] Audio loaded successfully:', track.title, track.audioUrl);
                        }}
                      >
                        Your browser does not support the audio element.
                      </audio>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                    <div className="flex items-center gap-1">
                      <Eye className="w-4 h-4" />
                      {track.plays} plays
                    </div>
                    <div>
                      Uploaded {new Date(track.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => copyShareLink(track.share_link)}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {copiedLink === track.share_link ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Link2 className="w-4 h-4" />
                          Copy Share Link
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => openTrackLink(track.share_link)}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open
                    </button>
                    <button
                      onClick={() => handleDelete(track.id)}
                      className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-6">Upload Unreleased Track</h3>

            <form onSubmit={handleUpload} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Track Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="My Unreleased Song"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Artist Name *</label>
                <input
                  type="text"
                  value={formData.artist_name}
                  onChange={(e) => setFormData({ ...formData, artist_name: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Your Artist Name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Tell your fans about this track..."
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Audio File *</label>
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
                  className="w-full px-4 py-8 bg-black border-2 border-dashed border-gray-700 rounded-lg hover:border-blue-500 transition-colors flex flex-col items-center gap-2"
                  disabled={uploading}
                >
                  <Music className="w-8 h-8 text-gray-400" />
                  <span className="text-gray-400">
                    {audioFile ? audioFile.name : 'Click to upload audio file'}
                  </span>
                  <span className="text-xs text-gray-500">MP3, WAV, or other audio formats</span>
                </button>
                {uploading && audioUploadProgress > 0 && (
                  <div className="mt-3 w-full">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Uploading audio…</span>
                      <span>{audioUploadProgress}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-2 bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                        style={{ width: `${audioUploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Cover Art (Optional)</label>
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
                  className="w-full px-4 py-6 bg-black border-2 border-dashed border-gray-700 rounded-lg hover:border-blue-500 transition-colors flex flex-col items-center gap-2"
                  disabled={uploading}
                >
                  <Upload className="w-6 h-6 text-gray-400" />
                  <span className="text-gray-400 text-sm">
                    {coverArtFile ? coverArtFile.name : 'Click to upload cover art'}
                  </span>
                </button>
                {uploading && coverArtFile && coverArtUploadProgress > 0 && (
                  <div className="mt-3 w-full">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Uploading cover art…</span>
                      <span>{coverArtUploadProgress}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-2 bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                        style={{ width: `${coverArtUploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-800 pt-6">
                <label className="block text-sm font-medium mb-4">Privacy Settings</label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 bg-black border border-gray-700 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                    <input
                      type="radio"
                      name="privacy"
                      checked={formData.is_public}
                      onChange={() => setFormData({ ...formData, is_public: true, password: '' })}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        <Globe className="w-4 h-4 text-green-400" />
                        Public
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Anyone with the link can listen</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-4 bg-black border border-gray-700 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                    <input
                      type="radio"
                      name="privacy"
                      checked={!formData.is_public}
                      onChange={() => setFormData({ ...formData, is_public: false })}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        <Lock className="w-4 h-4 text-yellow-400" />
                        Private (Password Protected)
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Requires password to access</p>
                    </div>
                  </label>
                </div>

                {!formData.is_public && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-2">Password *</label>
                    <input
                      type="text"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
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
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {uploading ? 'Uploading...' : 'Upload Track'}
                </ProActionButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
