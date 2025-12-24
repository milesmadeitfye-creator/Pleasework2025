import { useState, useEffect } from 'react';
import { Music, Upload, Loader2, Download, Sparkles, Play, Volume2, VolumeX, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';

// Types
type VibeCard = {
  vibe: string;
  description: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  clipCount: number;
};

type MusicVisual = {
  id: string;
  song_title: string;
  artist_name: string | null;
  selected_vibe: string;
  target_length_seconds: number;
  caption_style: string | null;
  render_status: string;
  final_video_url: string | null;
  final_thumbnail_url: string | null;
  created_at: string;
};

export function MusicVisualGenerator() {
  // LAUNCH LOCK: Feature temporarily disabled to prevent crashes
  return (
    <div className="max-w-4xl mx-auto px-6 py-24 text-center">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 mb-6">
        <Music className="w-10 h-10 text-blue-400" />
      </div>
      <h2 className="text-3xl font-bold text-white mb-4">Music Visuals</h2>
      <p className="text-lg text-gray-400 mb-2">This feature is temporarily locked while we finish rollout.</p>
      <p className="text-gray-500">Coming back shortly.</p>
    </div>
  );

  // All code below is temporarily unreachable - do not delete
  const { user } = useAuth();

  // State
  const [vibeCards, setVibeCards] = useState<VibeCard[]>([]);
  const [loadingVibes, setLoadingVibes] = useState(true);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [targetLength, setTargetLength] = useState<20 | 30 | 40>(20);
  const [captionStyle, setCaptionStyle] = useState<'none' | 'lyric' | 'mood'>('none');

  // Song upload
  const [songFile, setSongFile] = useState<File | null>(null);
  const [songUrl, setSongUrl] = useState<string | null>(null);
  const [uploadingtheSong, setUploadingSong] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Generation
  const [currentVisual, setCurrentVisual] = useState<MusicVisual | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Library
  const [myVisuals, setMyVisuals] = useState<MusicVisual[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  // Video player
  const [isMuted, setIsMuted] = useState(true);

  // Load vibe cards from broll_assets (group by vibe)
  useEffect(() => {
    loadVibeCards();
  }, []);

  // Load user's visual library
  useEffect(() => {
    if (user) {
      loadMyVisuals();
    }
  }, [user]);

  // Poll for status when generating
  useEffect(() => {
    if (currentVisual && currentVisual.render_status === 'processing') {
      const interval = setInterval(() => {
        pollVisualStatus(currentVisual.id);
      }, 3000);
      setPollingInterval(interval);
      return () => clearInterval(interval);
    } else {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
  }, [currentVisual]);

  async function loadVibeCards() {
    try {
      setLoadingVibes(true);

      // Query broll_assets, group by vibe
      const { data, error } = await supabase
        .from('broll_assets')
        .select('vibe, file_url, thumbnail_url, description')
        .eq('loop_safe', true)
        .eq('aspect_ratio', '9:16')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        // No broll assets yet - show default vibes with placeholders
        setVibeCards([
          { vibe: 'dark_abstract', description: 'Bold geometric shapes with deep shadows', clipCount: 0 },
          { vibe: 'moody_broll', description: 'Cinematic footage with atmospheric depth', clipCount: 0 },
          { vibe: 'studio_vibes', description: 'Professional recording session aesthetics', clipCount: 0 },
          { vibe: 'minimal_motion', description: 'Subtle movement with modern simplicity', clipCount: 0 },
          { vibe: 'neon_night', description: 'Urban nightlife with vibrant colors', clipCount: 0 },
        ]);
        setLoadingVibes(false);
        return;
      }

      // Group by vibe and pick the newest clip as preview
      const vibeMap = new Map<string, { clips: any[]; description: string }>();
      data.forEach(clip => {
        if (!vibeMap.has(clip.vibe)) {
          vibeMap.set(clip.vibe, { clips: [], description: clip.description || '' });
        }
        vibeMap.get(clip.vibe)!.clips.push(clip);
      });

      const cards: VibeCard[] = Array.from(vibeMap.entries()).map(([vibe, info]) => {
        const newestClip = info.clips[0];
        return {
          vibe,
          description: info.description || vibe.replace(/_/g, ' '),
          previewUrl: newestClip.file_url,
          thumbnailUrl: newestClip.thumbnail_url,
          clipCount: info.clips.length,
        };
      });

      setVibeCards(cards);

      // Auto-select first vibe
      if (cards.length > 0 && !selectedVibe) {
        setSelectedVibe(cards[0].vibe);
      }
    } catch (err) {
      console.error('[MusicVisualGenerator] Error loading vibe cards:', err);
    } finally {
      setLoadingVibes(false);
    }
  }

  async function loadMyVisuals() {
    try {
      setLoadingLibrary(true);
      const { data, error } = await supabase
        .from('music_visuals')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setMyVisuals(data || []);
    } catch (err) {
      console.error('[MusicVisualGenerator] Error loading library:', err);
    } finally {
      setLoadingLibrary(false);
    }
  }

  async function handleSongUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('audio/')) {
      setUploadError('Please upload an audio file (MP3 or WAV)');
      return;
    }

    setSongFile(file);
    setUploadError(null);

    try {
      setUploadingSong(true);

      // Upload to Supabase Storage
      const fileName = `${user!.id}/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('music-visuals')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('music-visuals')
        .getPublicUrl(data.path);

      setSongUrl(urlData.publicUrl);
      console.log('[MusicVisualGenerator] Song uploaded:', urlData.publicUrl);
    } catch (err: any) {
      console.error('[MusicVisualGenerator] Upload error:', err);
      setUploadError(err.message || 'Failed to upload song');
      setSongFile(null);
    } finally {
      setUploadingSong(false);
    }
  }

  async function handleGenerate() {
    if (!selectedVibe || !songUrl || !songFile || !user) return;

    try {
      setGenerating(true);
      setUploadError(null);

      // Create job row in music_visuals
      const { data: visual, error } = await supabase
        .from('music_visuals')
        .insert({
          user_id: user.id,
          song_title: songFile.name.replace(/\.(mp3|wav|m4a)$/i, ''),
          artist_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Artist',
          audio_url: songUrl,
          audio_duration_seconds: targetLength, // rough estimate
          selected_vibe: selectedVibe,
          target_length_seconds: targetLength,
          caption_style: captionStyle === 'none' ? null : captionStyle,
          render_status: 'processing',
          broll_clip_ids: [], // will be selected by backend
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentVisual(visual);
      console.log('[MusicVisualGenerator] Job created:', visual.id);

      // Trigger render function
      const response = await fetch('/.netlify/functions/music-visuals-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visual_id: visual.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to start render');
      }

      console.log('[MusicVisualGenerator] Render started');
    } catch (err: any) {
      console.error('[MusicVisualGenerator] Generate error:', err);
      setUploadError(err.message || 'Failed to generate visual');
      setGenerating(false);
    }
  }

  async function pollVisualStatus(visualId: string) {
    try {
      const { data, error } = await supabase
        .from('music_visuals')
        .select('*')
        .eq('id', visualId)
        .single();

      if (error) throw error;

      setCurrentVisual(data);

      if (data.render_status === 'completed' || data.render_status === 'failed') {
        setGenerating(false);
        if (data.render_status === 'completed') {
          loadMyVisuals(); // Refresh library
        }
      }
    } catch (err) {
      console.error('[MusicVisualGenerator] Poll error:', err);
    }
  }

  function handleCreateAnother() {
    setCurrentVisual(null);
    setSongFile(null);
    setSongUrl(null);
    setGenerating(false);
    setUploadError(null);
  }

  function handleDownload(url: string) {
    window.open(url, '_blank');
  }

  function formatDuration(seconds: number) {
    return `${seconds}s`;
  }

  // Empty State - No song uploaded
  if (!songFile && !currentVisual) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-6">
            <Music className="w-10 h-10 text-blue-400" />
          </div>

          <h1 className="text-4xl font-bold text-white mb-3">
            Music Visuals
          </h1>

          <p className="text-lg text-gray-400 mb-8 max-w-md">
            Turn your song into scroll-stopping visuals. No AI credits needed.
          </p>

          <label className="cursor-pointer px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20">
            <Upload className="w-5 h-5" />
            Upload Song
            <input
              type="file"
              accept="audio/mp3,audio/wav,audio/m4a"
              onChange={handleSongUpload}
              className="hidden"
              disabled={uploadingSong}
            />
          </label>

          {uploadingSong && (
            <div className="mt-4 flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Uploading...</span>
            </div>
          )}

          {uploadError && (
            <div className="mt-4 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {uploadError}
            </div>
          )}

          <p className="text-sm text-gray-500 mt-4">
            MP3 or WAV · Optimized for 9:16 vertical video
          </p>
        </div>

        {/* My Visuals Library (if any) */}
        {myVisuals.length > 0 && (
          <div className="border-t border-white/5 pt-12 mt-12">
            <h2 className="text-2xl font-bold text-white mb-6">Your Visuals</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {myVisuals.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setCurrentVisual(item)}
                  className="group relative bg-gradient-to-br from-gray-900/80 to-gray-800/50 rounded-xl overflow-hidden border border-white/5 hover:border-white/20 transition-all cursor-pointer"
                >
                  <div className="aspect-[9/16] bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                    {item.final_thumbnail_url ? (
                      <img src={item.final_thumbnail_url} alt={item.song_title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-500/10 to-purple-500/10" />
                    )}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <p className="text-white text-xs font-medium truncate">{item.song_title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-blue-300">{item.selected_vibe.replace(/_/g, ' ')}</span>
                      <span className="px-2 py-0.5 bg-white/10 text-white text-xs rounded-full">
                        {item.target_length_seconds}s
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Loaded State - Show builder + preview
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">

        {/* Left Column - Builder */}
        <div className="space-y-6">

          {/* Song Card */}
          <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/50 rounded-2xl p-5 border border-white/5 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Music className="w-8 h-8 text-blue-400" />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold truncate">{songFile?.name || 'Song'}</h3>
                <p className="text-gray-400 text-sm">Ready to generate</p>
              </div>

              {!currentVisual && (
                <button
                  onClick={handleCreateAnother}
                  className="text-gray-400 hover:text-white transition-colors"
                  title="Remove song"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Choose Visual Style */}
          <div>
            <h3 className="text-white font-semibold mb-4">Choose a Visual Vibe</h3>

            {loadingVibes ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {vibeCards.map((card) => (
                  <button
                    key={card.vibe}
                    onClick={() => setSelectedVibe(card.vibe)}
                    disabled={generating}
                    className={`
                      relative text-left p-4 rounded-xl transition-all
                      ${selectedVibe === card.vibe
                        ? 'bg-blue-600/20 border-2 border-blue-500 shadow-lg shadow-blue-600/30'
                        : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
                      }
                      ${generating ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    {/* Preview */}
                    <div className="w-full h-24 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 mb-3 flex items-center justify-center overflow-hidden">
                      {card.thumbnailUrl ? (
                        <img src={card.thumbnailUrl} alt={card.vibe} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-500/10 to-purple-500/10" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="space-y-1">
                      <h4 className="text-white font-medium text-sm capitalize">
                        {card.vibe.replace(/_/g, ' ')}
                      </h4>
                      <p className="text-gray-400 text-xs leading-relaxed line-clamp-2">
                        {card.description}
                      </p>
                      {card.clipCount > 0 && (
                        <p className="text-gray-500 text-xs">{card.clipCount} clips</p>
                      )}
                    </div>

                    {/* Selected indicator */}
                    {selectedVibe === card.vibe && (
                      <div className="absolute top-3 right-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Duration Selector */}
          <div>
            <h3 className="text-white font-semibold mb-3">Duration</h3>
            <div className="flex gap-2">
              {([20, 30, 40] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setTargetLength(d)}
                  disabled={generating}
                  className={`
                    flex-1 px-4 py-3 rounded-xl font-medium transition-all
                    ${targetLength === d
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                    }
                    ${generating ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          {/* Caption Style */}
          <div>
            <h3 className="text-white font-semibold mb-3">Captions (Optional)</h3>
            <div className="flex gap-2">
              {(['none', 'lyric', 'mood'] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => setCaptionStyle(style)}
                  disabled={generating}
                  className={`
                    flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all
                    ${captionStyle === style
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                    }
                    ${generating ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {style === 'none' ? 'None' : style === 'lyric' ? 'Lyric' : 'Mood'}
                </button>
              ))}
            </div>
          </div>

          {/* Generate / Create Another Button */}
          {!currentVisual ? (
            <button
              onClick={handleGenerate}
              disabled={!selectedVibe || !songUrl || generating}
              className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-600/20 disabled:shadow-none"
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Visual
                </>
              )}
            </button>
          ) : currentVisual.render_status === 'completed' ? (
            <button
              onClick={handleCreateAnother}
              className="w-full px-6 py-4 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 border border-white/20"
            >
              <Sparkles className="w-5 h-5" />
              Create Another Version
            </button>
          ) : null}

          {uploadError && currentVisual && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {uploadError}
            </div>
          )}
        </div>

        {/* Right Column - Preview */}
        <div className="lg:sticky lg:top-8 h-fit">
          <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/50 rounded-2xl p-6 border border-white/5 shadow-xl">

            {/* Phone Frame Preview */}
            <div className="relative mx-auto" style={{ maxWidth: '320px' }}>
              <div className="relative aspect-[9/16] bg-black rounded-3xl overflow-hidden border-4 border-gray-800 shadow-2xl">

                {/* Processing State */}
                {currentVisual && currentVisual.render_status === 'processing' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-gradient-to-br from-blue-900/20 to-purple-900/20">
                    <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-4" />
                    <div className="w-full max-w-[200px] h-2 bg-gray-800 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                    </div>
                    <p className="text-white font-medium mb-1">Rendering...</p>
                    <p className="text-gray-400 text-xs">This takes about 30-60 seconds</p>
                  </div>
                )}

                {/* Failed State */}
                {currentVisual && currentVisual.render_status === 'failed' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                    <XCircle className="w-12 h-12 text-red-400 mb-4" />
                    <p className="text-white font-medium mb-1">Render Failed</p>
                    <p className="text-gray-400 text-xs mb-4">
                      {currentVisual.render_error || 'Something went wrong'}
                    </p>
                    <button
                      onClick={handleCreateAnother}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
                    >
                      Try Again
                    </button>
                  </div>
                )}

                {/* Completed State */}
                {currentVisual && currentVisual.render_status === 'completed' && currentVisual.final_video_url && (
                  <>
                    <video
                      src={currentVisual.final_video_url}
                      className="w-full h-full object-cover"
                      autoPlay
                      loop
                      muted={isMuted}
                      playsInline
                    />

                    {/* Controls overlay */}
                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                      <button
                        onClick={() => setIsMuted(!isMuted)}
                        className="w-10 h-10 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                      >
                        {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                      </button>

                      <div className="px-3 py-1 bg-green-500/20 backdrop-blur-sm rounded-full flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-green-300 text-xs font-medium">Ready</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Idle State */}
                {!currentVisual && (
                  <div className="absolute inset-0 flex items-center justify-center text-center p-6">
                    <div>
                      <Play className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">
                        {selectedVibe ? 'Preview will show here' : 'Select a vibe to begin'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons (only when complete) */}
            {currentVisual && currentVisual.render_status === 'completed' && currentVisual.final_video_url && (
              <div className="mt-6 space-y-3">
                <button
                  onClick={() => handleDownload(currentVisual.final_video_url!)}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  <Download className="w-5 h-5" />
                  Download MP4
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* My Visuals Library */}
      {myVisuals.length > 0 && (
        <div className="border-t border-white/5 pt-12">
          <h2 className="text-2xl font-bold text-white mb-6">Your Visuals</h2>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {myVisuals.map((item) => (
              <div
                key={item.id}
                onClick={() => setCurrentVisual(item)}
                className="group relative bg-gradient-to-br from-gray-900/80 to-gray-800/50 rounded-xl overflow-hidden border border-white/5 hover:border-white/20 transition-all cursor-pointer"
              >
                {/* Thumbnail */}
                <div className="aspect-[9/16] bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                  {item.final_thumbnail_url ? (
                    <img src={item.final_thumbnail_url} alt={item.song_title} className="w-full h-full object-cover" />
                  ) : item.render_status === 'processing' ? (
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                  ) : item.render_status === 'failed' ? (
                    <XCircle className="w-8 h-8 text-red-400" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-500/10 to-purple-500/10" />
                  )}
                </div>

                {/* Info overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <p className="text-white text-xs font-medium truncate mb-1">{item.song_title}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-blue-300 capitalize">
                      {item.selected_vibe.replace(/_/g, ' ')}
                    </span>
                    <span className="px-2 py-0.5 bg-white/10 text-white text-xs rounded-full">
                      {item.target_length_seconds}s
                    </span>
                  </div>
                </div>

                {/* Hover download button */}
                {item.render_status === 'completed' && item.final_video_url && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(item.final_video_url!);
                      }}
                      className="w-12 h-12 bg-white/10 backdrop-blur-sm hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
                    >
                      <Download className="w-6 h-6" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
