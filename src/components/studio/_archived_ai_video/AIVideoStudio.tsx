import { useState, useEffect, useRef } from 'react';
import {
  Video,
  Loader2,
  Play,
  Clock,
  CheckCircle,
  XCircle,
  Sparkles,
  Music,
  Upload,
  X,
  ExternalLink,
  Download,
  Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../../contexts/AuthContext';

type AIVideo = {
  id: string;
  job_id: string;
  model: string;
  prompt: string;
  duration_seconds: number;
  aspect_ratio: string;
  platform_tags: string[];
  campaign_preset?: string;
  visual_template?: string;
  editing_style?: string;
  audio_source?: string;
  lyrics_used?: boolean;
  track_title?: string;
  audio_url?: string;
  reference_video_url?: string;
  text_style?: string;
  lyrics_text?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  thumbnail_url?: string;
  created_at: string;
};

const CAMPAIGN_PRESETS = [
  { id: 'promote_single', label: 'Promote New Single', icon: '🎵' },
  { id: 'drive_presaves', label: 'Drive Pre-Saves', icon: '💾' },
  { id: 'announce_video', label: 'Announce Music Video', icon: '🎬' },
  { id: 'announce_show', label: 'Announce Live Show', icon: '🎤' },
  { id: 'behind_scenes', label: 'Behind-the-Scenes', icon: '🎥' },
  { id: 'fan_recap', label: 'Fan Recap / Montage', icon: '✨' },
];

const VISUAL_TEMPLATES = [
  {
    id: 'cinematic_broll',
    label: 'Cinematic B-Roll',
    description: 'Depth, light flares, slow motion',
    bestFor: 'YouTube'
  },
  {
    id: 'performance_visualizer',
    label: 'Performance Visualizer',
    description: 'Stage energy, artist in action',
    bestFor: 'All platforms'
  },
  {
    id: 'cover_art_motion',
    label: 'Cover Art Motion',
    description: 'Animated artwork with particles',
    bestFor: 'Instagram'
  },
  {
    id: 'lyric_video',
    label: 'Lyric Video',
    description: 'Typography, text animations',
    bestFor: 'YouTube'
  },
  {
    id: 'social_ad',
    label: 'Social Ad',
    description: 'Hook + CTA, thumb-stopping',
    bestFor: 'Meta/IG'
  },
  {
    id: 'vhs_90s',
    label: '90s VHS',
    description: 'Retro texture, analog vibes',
    bestFor: 'TikTok'
  },
  {
    id: 'anime_comic',
    label: 'Anime / Motion Comic',
    description: 'Stylized, manga-panel frames',
    bestFor: 'TikTok'
  },
];

const EDITING_STYLES = [
  { id: 'clean_minimal', label: 'Clean / Minimal' },
  { id: 'fast_cuts_hype', label: 'Fast Cuts / Hype' },
  { id: 'dreamy_soft', label: 'Dreamy / Soft' },
  { id: 'vhs_retro', label: 'VHS / Retro' },
  { id: 'high_contrast_street', label: 'High-contrast / Street' },
  { id: 'anime_stylized', label: 'Anime / Stylized' },
];

const TEXT_STYLES = [
  { id: 'none', label: 'None' },
  { id: 'captions', label: 'Clean Captions' },
  { id: 'bold', label: 'Bold Block Text' },
  { id: 'kinetic', label: 'Kinetic Typography' },
  { id: 'karaoke', label: 'Karaoke Style' },
];

const ENABLE_LEGACY_AI_VIDEO = false;

export function AIVideoStudio() {
  if (!ENABLE_LEGACY_AI_VIDEO) {
    return null;
  }

  const { user } = useAuth();

  // Core fields
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<'sora-2' | 'sora-2-pro'>('sora-2');
  const [duration, setDuration] = useState(30);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [platforms, setPlatforms] = useState<string[]>(['meta']);

  // Clip selection
  const [clipLengthSeconds, setClipLengthSeconds] = useState<number>(30);
  const [clipStartSeconds, setClipStartSeconds] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Campaign & templates
  const [campaignPreset, setCampaignPreset] = useState<string>('');
  const [visualTemplate, setVisualTemplate] = useState<string>('');
  const [editingStyle, setEditingStyle] = useState<string>('clean_minimal');

  // Audio
  const [audioSource, setAudioSource] = useState<'upload' | 'link'>('upload');
  const [trackTitle, setTrackTitle] = useState('');
  const [audioFileUrl, setAudioFileUrl] = useState('');
  const [audioFilePath, setAudioFilePath] = useState('');
  const [streamingLink, setStreamingLink] = useState('');
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState('');

  // Lyrics
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsSource, setLyricsSource] = useState<'auto' | 'manual'>('auto');
  const [lyricsText, setLyricsText] = useState('');
  const [textStyle, setTextStyle] = useState('captions');

  // Pro mode
  const [usePro, setUsePro] = useState(false);

  // State
  const [generating, setGenerating] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<AIVideo | null>(null);
  const [recentVideos, setRecentVideos] = useState<AIVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (user) {
      loadRecentVideos();
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const loadRecentVideos = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/.netlify/functions/ai-video-list', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        setRecentVideos(data.videos || []);
      }
    } catch (err) {
      console.error('Failed to load recent videos:', err);
    }
  };

  const togglePlatform = (platform: string) => {
    setPlatforms(prev =>
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

  const formatTime = (seconds: number): string => {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      setError('Please select an audio file');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError('Audio file is too large. Maximum size is 50MB.');
      return;
    }

    try {
      setUploadingAudio(true);
      setError(null);

      const ext = file.name.split('.').pop() || 'mp3';
      const fileName = `audio/${user?.id}/${Date.now()}_${crypto.randomUUID()}.${ext}`;

      console.log('[AIVideoStudio] Uploading audio to uploads bucket:', fileName);

      const { data, error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('[AIVideoStudio] Upload error:', uploadError);
        throw uploadError;
      }

      console.log('[AIVideoStudio] Upload successful, path:', data.path);
      setAudioFilePath(data.path);

      // Generate public URL
      const { data: { publicUrl } } = supabase.storage
        .from('uploads')
        .getPublicUrl(data.path);

      console.log('[AIVideoStudio] Generated public URL:', publicUrl);
      setAudioFileUrl(publicUrl);

      // Auto-set track title from filename if empty
      if (!trackTitle) {
        setTrackTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    } catch (err: any) {
      console.error('[AIVideoStudio] Audio upload failed:', err);
      setError('Failed to upload audio: ' + err.message);
    } finally {
      setUploadingAudio(false);
    }
  };

  const clearAudioFile = () => {
    setAudioFileUrl('');
    setAudioFilePath('');
    setStreamingLink('');
    setAudioDuration(null);
    setClipStartSeconds(0);
    setError(null);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    if (!campaignPreset) {
      setError('Please select a campaign preset');
      return;
    }

    if (!visualTemplate) {
      setError('Please select a visual template');
      return;
    }

    // Determine audio source
    const hasUpload = audioSource === 'upload' && audioFilePath;
    const hasStreamingLink = audioSource === 'link' && streamingLink.trim();

    if (showLyrics && lyricsSource === 'auto' && !hasUpload && !hasStreamingLink) {
      setError('To auto-transcribe lyrics, please upload your song audio file first.');
      return;
    }

    if (showLyrics && lyricsSource === 'manual' && !lyricsText.trim()) {
      setError('Please enter lyrics or switch to auto-transcribe.');
      return;
    }

    try {
      setGenerating(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const payload = {
        userId: user.id,
        prompt: prompt.trim(),
        model,
        clipLength: duration,
        aspectRatio,
        targetPlatforms: platforms,
        campaignPreset,
        visualTemplate,
        editingStyle,
        audioPath: hasUpload ? audioFilePath : null,
        audioUrl: hasUpload ? audioFileUrl : (hasStreamingLink ? streamingLink.trim() : null),
        lyrics: {
          mode: showLyrics && lyricsSource === 'auto' ? 'auto' : 'manual',
          text: showLyrics && lyricsSource === 'manual' ? lyricsText : undefined,
        },
        referenceUrl: referenceVideoUrl.trim() || null,
        textStyle: showLyrics ? textStyle : 'none',
        trackTitle: trackTitle.trim() || null,
        usePro,
      };

      console.log('[AIVideoStudio] Sending payload:', {
        userId: user.id.substring(0, 8) + '...',
        prompt: payload.prompt.substring(0, 50) + '...',
        duration: payload.clipLength,
        aspectRatio: payload.aspectRatio,
        audioPath: payload.audioPath || 'none',
        hasAudioUrl: !!payload.audioUrl,
        lyricsMode: payload.lyrics.mode,
      });

      const res = await fetch('/.netlify/functions/ai-video-create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          clipLengthSeconds,
          clipStartSeconds,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('[AIVideoStudio] API Error:', {
          status: res.status,
          errorData,
        });

        // Store error details for debugging
        setErrorDetails(errorData);

        // Handle specific error types with better messages
        if (res.status === 501 && errorData.error === 'SORA_DISABLED') {
          throw new Error('AI video generation is temporarily disabled. Upload your track or video using the options above, or link to an existing file.');
        } else if (res.status === 400) {
          if (errorData.error === 'MISSING_PROMPT') {
            throw new Error('Please enter a video prompt');
          } else if (errorData.error === 'INVALID_DURATION') {
            throw new Error('Please select a clip length (15, 30, or 60 seconds)');
          } else if (errorData.error === 'INVALID_ASPECT_RATIO') {
            throw new Error('Please select an aspect ratio');
          } else if (errorData.error === 'MISSING_AUDIO') {
            throw new Error('To auto-transcribe lyrics, please upload your song audio file first');
          } else if (errorData.error === 'audio_resolution_failed') {
            throw new Error(errorData.message || 'Failed to resolve audio file. Please try re-uploading.');
          } else if (errorData.error === 'TRANSCRIPTION_FAILED') {
            throw new Error(errorData.message || 'Failed to transcribe audio. Please try a different file or format.');
          } else if (errorData.error === 'INVALID_REQUEST') {
            throw new Error('Invalid request to OpenAI. Please check your settings and try again.');
          } else {
            throw new Error(errorData.message || 'Invalid request. Please check all required fields.');
          }
        } else if (res.status === 401) {
          throw new Error('Authentication failed. Please log in again.');
        } else if (res.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        } else if (res.status === 404) {
          throw new Error('Video generation model not available. The Sora API may not be accessible with your OpenAI key.');
        } else if (res.status === 500 || res.status === 502 || res.status === 503) {
          throw new Error(errorData.message || 'Video generation failed. Please try again in a moment.');
        } else {
          throw new Error(errorData.message || 'Failed to create video');
        }
      }

      const data = await res.json();

      const newVideo: AIVideo = {
        id: data.id,
        job_id: data.jobId,
        model: 'gpt-video-1',
        prompt: prompt.trim(),
        duration_seconds: duration,
        aspect_ratio: aspectRatio,
        platform_tags: platforms,
        campaign_preset: campaignPreset,
        visual_template: visualTemplate,
        editing_style: editingStyle,
        status: data.status,
        created_at: new Date().toISOString(),
      };

      setCurrentVideo(newVideo);
      startPolling(newVideo.id);
      loadRecentVideos();

    } catch (err: any) {
      console.error('[AIVideoStudio] Generation error:', err);
      setError(err.message || 'Failed to generate video');
      // Keep error details from earlier if available
    } finally {
      setGenerating(false);
    }
  };

  const startPolling = (videoId: string) => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    const interval = setInterval(async () => {
      await pollVideoStatus(videoId);
    }, 5000);

    setPollingInterval(interval);
  };

  const pollVideoStatus = async (videoId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/.netlify/functions/ai-video-status?id=${videoId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();

        setCurrentVideo(prev => prev ? {
          ...prev,
          status: data.status,
          video_url: data.videoUrl,
          thumbnail_url: data.thumbnailUrl,
        } : null);

        if (data.status === 'completed' || data.status === 'failed') {
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }
          loadRecentVideos();
        }
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-full">
            <Clock className="w-3 h-3" />
            Queued
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500/10 text-yellow-400 text-xs rounded-full">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded-full">
            <CheckCircle className="w-3 h-3" />
            Completed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-400 text-xs rounded-full">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  const canGenerate = prompt.trim() && campaignPreset && visualTemplate && !generating;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">AI Video Studio</h2>
        <p className="text-sm text-gray-400">
          Create professional music marketing videos with Sora AI
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* Error Banner */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm text-red-400 mb-2">{error}</p>
                  {errorDetails && (
                    <div className="space-y-2">
                      <button
                        onClick={() => setShowErrorDetails(!showErrorDetails)}
                        className="text-xs text-red-300 hover:text-red-200 underline"
                      >
                        {showErrorDetails ? 'Hide details' : 'Show details'}
                      </button>
                      {showErrorDetails && (
                        <div className="bg-black/30 rounded p-2 text-xs text-gray-300 font-mono overflow-auto max-h-40">
                          <pre>{JSON.stringify(errorDetails, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setError(null);
                    setErrorDetails(null);
                    setShowErrorDetails(false);
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Core Settings */}
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              Video Concept
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Prompt *
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your video concept... (e.g., 'A vibrant cityscape at sunset with neon lights synced to the beat')"
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Clip Length
                  </label>
                  <div className="flex gap-2">
                    {[15, 30, 60].map((sec) => (
                      <button
                        key={sec}
                        onClick={() => {
                          setDuration(sec);
                          setClipLengthSeconds(sec);
                          // Clamp start so the end never exceeds audio duration
                          if (audioDuration != null) {
                            const maxStart = Math.max(audioDuration - sec, 0);
                            setClipStartSeconds(prev => Math.min(prev, maxStart));
                          }
                        }}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          duration === sec
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Model
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value as 'sora-2' | 'sora-2-pro')}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="sora-2">Sora 2 (Standard)</option>
                    <option value="sora-2-pro">Sora 2 Pro (Higher Quality)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Aspect Ratio
                  </label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="9:16">9:16 (Vertical - Reels/TikTok)</option>
                    <option value="16:9">16:9 (Horizontal - YouTube)</option>
                    <option value="1:1">1:1 (Square - IG Feed)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Target Platforms
                </label>
                <div className="flex flex-wrap gap-2">
                  {['meta', 'tiktok', 'ytshorts'].map((platform) => (
                    <button
                      key={platform}
                      onClick={() => togglePlatform(platform)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        platforms.includes(platform)
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
                      }`}
                    >
                      {platform === 'meta' && 'Meta / IG'}
                      {platform === 'tiktok' && 'TikTok'}
                      {platform === 'ytshorts' && 'YouTube Shorts'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Campaign Preset */}
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
            <h3 className="text-lg font-semibold text-white mb-4">
              Campaign Preset *
            </h3>
            <div className="flex flex-wrap gap-2">
              {CAMPAIGN_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setCampaignPreset(preset.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    campaignPreset === preset.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
                  }`}
                >
                  <span className="mr-2">{preset.icon}</span>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Visual Template */}
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
            <h3 className="text-lg font-semibold text-white mb-4">
              Visual Template *
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {VISUAL_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setVisualTemplate(template.id)}
                  className={`p-4 rounded-lg text-left transition-colors border ${
                    visualTemplate === template.id
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-gray-400 hover:bg-slate-700'
                  }`}
                >
                  <div className="font-medium mb-1">{template.label}</div>
                  <div className="text-xs opacity-75 mb-2">{template.description}</div>
                  <div className="text-xs px-2 py-0.5 bg-slate-700 rounded inline-block">
                    Best for: {template.bestFor}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Editing Style */}
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
            <h3 className="text-lg font-semibold text-white mb-4">
              Editing Style
            </h3>
            <select
              value={editingStyle}
              onChange={(e) => setEditingStyle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {EDITING_STYLES.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.label}
                </option>
              ))}
            </select>
          </div>

          {/* Music Assets */}
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Music className="w-5 h-5 text-blue-400" />
              Music Assets
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Track Title
                </label>
                <input
                  type="text"
                  value={trackTitle}
                  onChange={(e) => setTrackTitle(e.target.value)}
                  placeholder="My New Single"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Audio Source
                </label>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setAudioSource('upload')}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      audioSource === 'upload'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
                    }`}
                  >
                    Upload Audio (Unreleased)
                  </button>
                  <button
                    onClick={() => setAudioSource('link')}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      audioSource === 'link'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
                    }`}
                  >
                    Use Streaming Link
                  </button>
                </div>

                {audioSource === 'upload' ? (
                  <div>
                    {!audioFileUrl ? (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Upload className="w-8 h-8 text-gray-400 mb-2" />
                          <p className="text-sm text-gray-400">
                            {uploadingAudio ? 'Uploading...' : 'Click to upload audio file'}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            MP3, WAV, M4A (max 50MB)
                          </p>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept="audio/*"
                          onChange={handleAudioUpload}
                          disabled={uploadingAudio}
                        />
                      </label>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 p-3 bg-slate-800 rounded-lg">
                          <Music className="w-5 h-5 text-green-400" />
                          <span className="flex-1 text-sm text-white truncate">
                            {trackTitle || 'Audio uploaded'}
                          </span>
                          <button
                            onClick={clearAudioFile}
                            className="p-1 hover:bg-slate-700 rounded"
                          >
                            <X className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>

                        {/* Audio Player with Clip Selection */}
                        <div className="mt-4 space-y-3">
                          <audio
                            ref={audioRef}
                            src={audioFileUrl}
                            controls
                            onLoadedMetadata={(e) => {
                              const duration = e.currentTarget.duration;
                              if (!isNaN(duration)) {
                                setAudioDuration(duration);
                                // Clamp start if needed
                                const maxStart = Math.max(duration - clipLengthSeconds, 0);
                                setClipStartSeconds(prev => Math.min(prev, maxStart));
                              }
                            }}
                            className="w-full rounded-lg"
                          />

                          {audioDuration != null && (
                            <div className="space-y-1">
                              <label className="text-xs text-gray-400">
                                Select clip start ({clipLengthSeconds}s clip)
                              </label>
                              <input
                                type="range"
                                min={0}
                                max={Math.max(audioDuration - clipLengthSeconds, 0)}
                                step={0.1}
                                value={clipStartSeconds}
                                onChange={(e) => setClipStartSeconds(parseFloat(e.target.value))}
                                className="w-full accent-blue-500"
                              />
                              <div className="flex justify-between text-[11px] text-gray-500">
                                <span>Start: {formatTime(clipStartSeconds)}</span>
                                <span>End: {formatTime(clipStartSeconds + clipLengthSeconds)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <input
                      type="url"
                      value={streamingLink}
                      onChange={(e) => setStreamingLink(e.target.value)}
                      placeholder="https://open.spotify.com/track/..."
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Spotify, Apple Music, YouTube, etc.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Reference Video (Optional)
                </label>
                <input
                  type="url"
                  value={referenceVideoUrl}
                  onChange={(e) => setReferenceVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Lyrics */}
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={showLyrics}
                onChange={(e) => setShowLyrics(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800"
              />
              <label className="text-sm font-medium text-white">
                Show lyrics on screen
              </label>
            </div>

            {showLyrics && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => setLyricsSource('auto')}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      lyricsSource === 'auto'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
                    }`}
                  >
                    Auto-transcribe (Whisper AI)
                  </button>
                  <button
                    onClick={() => setLyricsSource('manual')}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      lyricsSource === 'manual'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
                    }`}
                  >
                    Paste Manually
                  </button>
                </div>

                {lyricsSource === 'manual' && (
                  <textarea
                    value={lyricsText}
                    onChange={(e) => setLyricsText(e.target.value)}
                    placeholder="Paste your lyrics here..."
                    rows={4}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Text Style
                  </label>
                  <select
                    value={textStyle}
                    onChange={(e) => setTextStyle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {TEXT_STYLES.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Sora Settings */}
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={usePro}
                onChange={(e) => setUsePro(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800"
              />
              <label className="text-sm font-medium text-white">
                Use Sora Pro (higher quality, slower)
              </label>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={`w-full py-3 rounded-lg font-semibold text-white transition-colors flex items-center justify-center gap-2 ${
                canGenerate
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
                  : 'bg-slate-700 cursor-not-allowed'
              }`}
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Generate with Sora
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: Status & Recent */}
        <div className="space-y-6">
          {/* Current Video */}
          {currentVideo && (
            <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
              <h3 className="text-lg font-semibold text-white mb-4">
                Current Video
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Status</span>
                  {getStatusBadge(currentVideo.status)}
                </div>
                <div className="text-sm text-gray-400">
                  {currentVideo.campaign_preset && (
                    <div>Campaign: {CAMPAIGN_PRESETS.find(p => p.id === currentVideo.campaign_preset)?.label}</div>
                  )}
                  {currentVideo.visual_template && (
                    <div>Template: {VISUAL_TEMPLATES.find(t => t.id === currentVideo.visual_template)?.label}</div>
                  )}
                </div>
                {currentVideo.video_url && (
                  <div className="flex gap-2">
                    <a
                      href={currentVideo.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4" />
                      Watch
                    </a>
                    <a
                      href={currentVideo.video_url}
                      download
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Videos */}
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
            <h3 className="text-lg font-semibold text-white mb-4">
              Recent Videos
            </h3>
            <div className="space-y-3">
              {recentVideos.length === 0 ? (
                <p className="text-sm text-gray-400">No videos yet</p>
              ) : (
                recentVideos.slice(0, 6).map((video) => (
                  <div
                    key={video.id}
                    className="p-3 bg-slate-800 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {video.campaign_preset && CAMPAIGN_PRESETS.find(p => p.id === video.campaign_preset)?.label}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {video.visual_template && VISUAL_TEMPLATES.find(t => t.id === video.visual_template)?.label}
                        </div>
                      </div>
                      {getStatusBadge(video.status)}
                    </div>
                    {video.video_url && (
                      <a
                        href={video.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium flex items-center justify-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
