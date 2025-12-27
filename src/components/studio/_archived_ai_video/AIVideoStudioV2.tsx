import { useState, useEffect } from 'react';
import { Video, Loader2, Play, Clock, CheckCircle, XCircle, Sparkles, RefreshCw, Film, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../../contexts/AuthContext';
import { useVideoGenerations } from '../../hooks/useVideoGenerations';
import { PromptMaker } from './PromptMaker';
import { VideoEditor } from './VideoEditor';
import { ALLOWED_DURATIONS } from '../../lib/videoChunkPlan';

const ENABLE_LEGACY_AI_VIDEO = false;

export function AIVideoStudioV2() {
  if (!ENABLE_LEGACY_AI_VIDEO) {
    return null;
  }

  const { user } = useAuth();
  const { current, recent, all, loading, error: hookError, refresh, getGenerationById } = useVideoGenerations();

  // Get selected video ID from URL
  const getSelectedIdFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('gen');
  };

  // UI State
  const [activeTab, setActiveTab] = useState<'create' | 'current' | 'recent' | 'editor'>('create');
  const [showPromptMaker, setShowPromptMaker] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(getSelectedIdFromUrl);

  // Form state
  const [prompt, setPrompt] = useState('');
  const [promptParts, setPromptParts] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [isPro, setIsPro] = useState(false);
  const [seconds, setSeconds] = useState(8);
  const [orientation, setOrientation] = useState('vertical');
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsText, setLyricsText] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioSourceType, setAudioSourceType] = useState<'upload' | 'link' | 'none'>('none');

  // Loading/error state
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Polling state
  const [polling, setPolling] = useState(false);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  // Register job state
  const [lastRegister, setLastRegister] = useState<{
    videoId: string;
    jobId: string;
    success: boolean;
    error?: string;
    timestamp: Date;
  } | null>(null);

  // Selected video
  const selectedVideo = selectedVideoId ? getGenerationById(selectedVideoId) : null;

  // Update URL when selection changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedVideoId) {
      params.set('gen', selectedVideoId);
    } else {
      params.delete('gen');
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [selectedVideoId]);

  // Restore selection from URL on mount
  useEffect(() => {
    const id = getSelectedIdFromUrl();
    if (id) {
      setSelectedVideoId(id);
      // If there's a selected video, switch to editor tab
      setActiveTab('editor');
    }
  }, []);

  // Automatic polling loop for processing videos (health poll every 10-15s)
  useEffect(() => {
    if (!user || current.length === 0) {
      return;
    }

    console.log('[AIVideoStudio] Starting health poll for', current.length, 'videos');

    const pollJobs = async () => {
      if (polling) {
        console.log('[AIVideoStudio] Poll already in progress, skipping');
        return;
      }

      try {
        setPolling(true);
        console.log('[AIVideoStudio] Health polling jobs...');

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.warn('[AIVideoStudio] No session, stopping poll');
          return;
        }

        const response = await fetch('/.netlify/functions/sora-poll-jobs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('[AIVideoStudio] Poll error:', errorData);
          return;
        }

        const result = await response.json();

        console.log('[AIVideoStudio] Poll result:', result);

        setLastPoll(new Date());

        // Refresh to get updated data (realtime will also trigger but this is immediate)
        if (result.updated_count > 0) {
          await refresh();

          // ✅ Auto-open completed videos in editor
          if (result.completed_ids && Array.isArray(result.completed_ids) && result.completed_ids.length > 0) {
            const newlyCompleted = result.completed_ids[0]; // Get first completed
            console.log('[AIVideoStudio] ✅ Video completed! Auto-opening in editor:', newlyCompleted);
            handleSelectVideo(newlyCompleted, true); // Switch to editor
          }
        }
      } catch (err: any) {
        console.error('[AIVideoStudio] Poll error:', err);
      } finally {
        setPolling(false);
      }
    };

    // Initial poll
    pollJobs();

    // Set up interval (every 12 seconds for health check)
    const interval = setInterval(pollJobs, 12000);

    return () => {
      console.log('[AIVideoStudio] Cleaning up health poll');
      clearInterval(interval);
    };
  }, [user, current.length, refresh, polling]);

  const handleSelectVideo = (videoId: string, switchToEditor = true) => {
    setSelectedVideoId(videoId);
    if (switchToEditor) {
      setActiveTab('editor');
    }
  };

  const handleUsePrompt = (generatedPrompt: string, parts: any) => {
    setPrompt(generatedPrompt);
    setPromptParts(parts);
    setSeconds(parts.seconds);
    setOrientation(parts.orientation);
    setShowPromptMaker(false);
  };

  const handleCreate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt or use the Prompt Maker');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please log in to create videos');
        return;
      }

      const sizeMap: Record<string, string> = {
        vertical: '720x1280',
        horizontal: '1280x720',
        square: '1024x1024',
      };

      const isMultiSegment = seconds > 12;

      const body = {
        title: title || null,
        prompt,
        promptParts: promptParts || undefined,
        isPro,
        seconds: isMultiSegment ? 12 : seconds,
        targetSeconds: isMultiSegment ? seconds : undefined,
        size: sizeMap[orientation] || '720x1280',
        orientation, // ✅ Pass orientation for prompt builder
        showLyrics,
        lyricsText: lyricsText || null, // ✅ Pass lyrics text
        audioUrl: audioUrl || null,
        audioSourceType, // ✅ Pass audio source type
        usePromptBuilder: true, // ✅ Enable AI prompt builder
      };

      console.log('[AIVideoStudio] Creating video:', body);

      const response = await fetch('/.netlify/functions/sora-video-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.message || errorData.details || 'Failed to create video';
        console.error('[AIVideoStudio] Create failed (HTTP error):', errorData);
        throw new Error(errorMsg);
      }

      const result = await response.json();

      console.log('[AIVideoStudio] Create result:', result);

      if (result.success === false) {
        const errorMsg = result.message || result.details || 'Video creation failed';
        console.error('[AIVideoStudio] Create returned error:', result);
        throw new Error(errorMsg);
      }

      if (!result.video_id) {
        console.error('[AIVideoStudio] No video_id in response:', result);
        throw new Error('Server did not return video_id - video may not have been saved');
      }

      console.log('[AIVideoStudio] ✅ Video created:', {
        video_id: result.video_id,
        job_id: result.job_id,
        mode: result.mode,
        status: result.status,
      });

      // ✅ Register job ID as failsafe (even though sora-video-create already persisted it)
      if (result.job_id) {
        try {
          console.log('[AIVideoStudio] Registering job ID as failsafe:', {
            videoId: result.video_id,
            jobId: result.job_id,
          });

          const registerResponse = await fetch('/.netlify/functions/ai-video-register-job', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              videoId: result.video_id,
              jobId: result.job_id,
              provider: 'sora',
            }),
          });

          const registerResult = await registerResponse.json();

          setLastRegister({
            videoId: result.video_id,
            jobId: result.job_id,
            success: registerResponse.ok,
            error: registerResponse.ok ? undefined : registerResult.message,
            timestamp: new Date(),
          });

          if (registerResponse.ok) {
            console.log('[AIVideoStudio] ✅ Job ID registered successfully:', registerResult);
          } else {
            console.warn('[AIVideoStudio] ⚠️ Job ID registration failed (non-critical):', registerResult);
          }
        } catch (registerErr: any) {
          console.error('[AIVideoStudio] Job ID registration error (non-critical):', registerErr);
          setLastRegister({
            videoId: result.video_id,
            jobId: result.job_id,
            success: false,
            error: registerErr.message,
            timestamp: new Date(),
          });
        }
      } else {
        console.warn('[AIVideoStudio] ⚠️ No job_id in create response - cannot register');
      }

      // Note: Optimistic update removed - we rely on realtime subscription
      // to update the UI after the video is created

      // Refresh to get the new video from DB (will replace optimistic update via realtime)
      await refresh();

      // Select the new video and switch to current tab
      handleSelectVideo(result.video_id, false);
      setActiveTab('current');

      // Reset form
      setPrompt('');
      setTitle('');
      setPromptParts(null);
    } catch (err: any) {
      console.error('[AIVideoStudio] Create video error:', err);
      setError(err.message || 'Failed to create video');
    } finally {
      setCreating(false);
    }
  };

  const getEffectiveStatus = (video: any) => {
    // If video_url exists, treat as completed regardless of status field
    if (video.video_url) {
      return 'completed';
    }
    return video.status || 'processing';
  };

  // ✅ Check if video is "stuck" (processing > 10 minutes)
  const isVideoStuck = (video: any) => {
    const effectiveStatus = getEffectiveStatus(video);
    if (effectiveStatus !== 'processing') return false;

    const updatedAt = new Date(video.updated_at || video.created_at).getTime();
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    return updatedAt < tenMinutesAgo;
  };

  // ✅ Retry status check for stuck video
  const handleRetryStatus = async (videoId: string) => {
    try {
      setPolling(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      console.log('[AIVideoStudio] Manually retrying status for:', videoId);

      await fetch('/.netlify/functions/sora-poll-jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      await refresh();
    } catch (err) {
      console.error('[AIVideoStudio] Retry status failed:', err);
    } finally {
      setPolling(false);
    }
  };

  const renderStatusBadge = (video: any) => {
    const effectiveStatus = getEffectiveStatus(video);
    const stuck = isVideoStuck(video);

    // Check if video has been processing too long (20+ minutes)
    const tooLong =
      effectiveStatus === 'processing' &&
      Date.now() - new Date(video.created_at).getTime() > 20 * 60 * 1000;

    switch (effectiveStatus) {
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-900 text-yellow-200 text-xs rounded">
            <Clock className="w-3 h-3" />
            Queued
          </span>
        );
      case 'processing':
        return (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-900 text-blue-200 text-xs rounded">
              <Loader2 className="w-3 h-3 animate-spin" />
              {tooLong ? 'Taking longer than usual...' : 'Processing'}
            </span>
            {/* ✅ Show retry button if stuck */}
            {stuck && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRetryStatus(video.id);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-700 hover:bg-yellow-600 text-yellow-100 text-xs rounded transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Retry Status
              </button>
            )}
          </div>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-900 text-green-200 text-xs rounded">
            <CheckCircle className="w-3 h-3" />
            Completed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-900 text-red-200 text-xs rounded">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded">
            {effectiveStatus}
          </span>
        );
    }
  };

  const renderVideoCard = (video: any, showOpenInEditor = true) => {
    const effectiveStatus = getEffectiveStatus(video);
    const isClickable = showOpenInEditor && (video.video_url || effectiveStatus === 'processing');

    return (
      <div
        key={video.id}
        className={`bg-gray-800 rounded-lg p-4 border border-gray-700 ${
          isClickable ? 'cursor-pointer hover:border-blue-600 transition-colors' : ''
        }`}
        onClick={() => isClickable && handleSelectVideo(video.id)}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <h4 className="text-white font-medium">
              {video.title || `Video ${video.id.substring(0, 8)}`}
            </h4>
            <p className="text-gray-400 text-sm mt-1 line-clamp-2">{video.prompt}</p>
          </div>
          {renderStatusBadge(video)}
        </div>

      {video.video_url && (
        <div className="mb-3">
          <video
            src={video.video_url}
            controls
            className="w-full rounded border border-gray-700"
          />
        </div>
      )}

      {video.error_message && (
        <div className="mb-3 p-2 bg-red-900 border border-red-700 rounded">
          <p className="text-red-200 text-xs">{video.error_message}</p>
        </div>
      )}

      {/* Debug info for processing videos */}
      {showDebug && (video.status === 'queued' || video.status === 'processing') && (
        <div className="mt-3 p-2 bg-gray-900 border border-gray-700 rounded text-xs font-mono">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-gray-500">Video ID:</span>{' '}
                <span className="text-blue-400">{video.id.substring(0, 8)}</span>
              </div>
              <div>
                <span className="text-gray-500">Status:</span>{' '}
                <span className="text-green-400">{video.status}</span>
              </div>
            </div>

            {/* Job ID columns */}
            <div className="border-t border-gray-800 pt-2">
              <div className="text-gray-400 text-xs mb-1">Job IDs:</div>
              <div className="space-y-1">
                <div>
                  <span className="text-gray-500">job_id:</span>{' '}
                  <span className={video.job_id ? "text-purple-400" : "text-red-400"}>
                    {video.job_id ? video.job_id.substring(0, 20) + '...' : 'NULL'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">provider_job_id:</span>{' '}
                  <span className={video.provider_job_id ? "text-purple-400" : "text-red-400"}>
                    {video.provider_job_id ? video.provider_job_id.substring(0, 20) + '...' : 'NULL'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">sora_job_id:</span>{' '}
                  <span className={video.sora_job_id ? "text-purple-400" : "text-red-400"}>
                    {video.sora_job_id ? video.sora_job_id.substring(0, 20) + '...' : 'NULL'}
                  </span>
                </div>
              </div>
            </div>

            {/* Register call status */}
            {lastRegister && lastRegister.videoId === video.id && (
              <div className="border-t border-gray-800 pt-2">
                <div className="text-gray-400 text-xs mb-1">Last Register Call:</div>
                <div className="space-y-1">
                  <div>
                    <span className="text-gray-500">Status:</span>{' '}
                    <span className={lastRegister.success ? "text-green-400" : "text-red-400"}>
                      {lastRegister.success ? 'SUCCESS' : 'FAILED'}
                    </span>
                  </div>
                  {lastRegister.error && (
                    <div>
                      <span className="text-gray-500">Error:</span>{' '}
                      <span className="text-red-400">{lastRegister.error}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">Time:</span>{' '}
                    <span className="text-gray-400">
                      {lastRegister.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {video.stitch_status && video.stitch_status !== 'single' && (
              <div className="border-t border-gray-800 pt-2">
                <span className="text-gray-500">Stitch:</span>{' '}
                <span className="text-yellow-400">{video.stitch_status}</span>
              </div>
            )}

            <div className="border-t border-gray-800 pt-2">
              <span className="text-gray-500">Updated:</span>{' '}
              <span className="text-gray-400">{new Date(video.updated_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Legacy debug section (keep for compatibility) */}
      {showDebug && (video.status === 'queued' || video.status === 'processing') && false && (
        <details className="mb-3">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
            Debug Info
          </summary>
          <div className="mt-2 p-2 bg-gray-900 rounded text-xs font-mono">
            <div className="space-y-1">
              <div>
                <span className="text-gray-500">Job ID:</span>{' '}
                <span className="text-gray-300">{video.openai_job_id || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Status:</span>{' '}
                <span className="text-gray-300">{video.status}</span>
              </div>
              <div>
                <span className="text-gray-500">Progress:</span>{' '}
                <span className="text-gray-300">{video.progress || 0}%</span>
              </div>
              <div>
                <span className="text-gray-500">Updated:</span>{' '}
                <span className="text-gray-300">
                  {new Date(video.updated_at).toLocaleTimeString()}
                </span>
              </div>
              {video.error_message && (
                <div>
                  <span className="text-gray-500">Error:</span>{' '}
                  <span className="text-red-400">{video.error_message}</span>
                </div>
              )}
            </div>
          </div>
        </details>
      )}

      <div className="flex gap-2 text-xs text-gray-400 mb-3">
        <span>{video.model}</span>
        <span>•</span>
        <span>{video.seconds}s</span>
        <span>•</span>
        <span>{new Date(video.created_at).toLocaleDateString()}</span>
      </div>

      {showOpenInEditor && video.video_url && (
        <div className="text-center py-2 bg-blue-900/20 rounded border border-blue-700">
          <p className="text-blue-300 text-xs font-medium">
            Click card to view in Editor
          </p>
        </div>
      )}

      {showOpenInEditor && !video.video_url && effectiveStatus === 'processing' && (
        <div className="text-center py-2">
          <p className="text-gray-400 text-xs">
            Processing... Click to monitor
          </p>
        </div>
      )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Video className="w-8 h-8 text-blue-400" />
            AI Video Studio
          </h1>
          <p className="text-gray-400 mt-1">
            Create professional music marketing videos with Sora
            {polling && (
              <span className="ml-2 text-xs text-blue-400">
                • Polling...
              </span>
            )}
            {lastPoll && !polling && (
              <span className="ml-2 text-xs text-gray-500">
                • Last check: {lastPoll.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded border border-gray-700 transition-colors text-sm"
          >
            {showDebug ? 'Hide' : 'Show'} Debug
          </button>
          <button
            onClick={async () => {
              // Force poll + refresh
              if (current.length > 0) {
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (session) {
                    await fetch('/.netlify/functions/sora-poll-jobs', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                      },
                    });
                  }
                } catch (err) {
                  console.error('[AIVideoStudio] Manual poll error:', err);
                }
              }
              await refresh();
            }}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded border border-gray-700 transition-colors flex items-center gap-2"
            disabled={loading || polling}
          >
            <RefreshCw className={`w-4 h-4 ${loading || polling ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Display */}
      {(error || hookError) && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-4">
          <p className="text-red-200 text-sm">{error || hookError}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-300 hover:text-red-100 text-xs mt-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {(['create', 'current', 'recent', 'editor'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === tab
                ? 'text-white border-b-2 border-blue-600'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'current' && current.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                {current.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {/* CREATE TAB */}
        {activeTab === 'create' && (
          <div className="space-y-6">
            {showPromptMaker ? (
              <div>
                <button
                  onClick={() => setShowPromptMaker(false)}
                  className="text-gray-400 hover:text-white mb-4 text-sm"
                >
                  ← Back to Create
                </button>
                <PromptMaker onUsePrompt={handleUsePrompt} />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-bold text-white mb-4">Create New Video</h3>

                  <div className="space-y-4">
                    {/* Title */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Title (optional)
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="My awesome video..."
                        className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Prompt */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-300">
                          Video Prompt
                        </label>
                        <button
                          onClick={() => setShowPromptMaker(true)}
                          className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
                        >
                          <Sparkles className="w-4 h-4" />
                          Use Prompt Maker
                        </button>
                      </div>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the video you want to create..."
                        className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 resize-none"
                        rows={4}
                      />
                    </div>

                    {/* Model Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Model</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsPro(false)}
                          className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-all ${
                            !isPro
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          Sora 2
                        </button>
                        <button
                          onClick={() => setIsPro(true)}
                          className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-all ${
                            isPro
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          Sora 2 Pro
                        </button>
                      </div>
                    </div>

                    {/* Duration */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Duration
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {ALLOWED_DURATIONS.map((s) => {
                          const isMultiSegment = s > 12;
                          return (
                            <button
                              key={s}
                              onClick={() => setSeconds(s)}
                              className={`px-4 py-2 rounded text-sm font-medium transition-all ${
                                seconds === s
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              } ${isMultiSegment ? 'relative' : ''}`}
                            >
                              {s}s
                              {isMultiSegment && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-500 rounded-full" title="Multi-segment" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {seconds > 12 && (
                        <p className="text-yellow-400 text-xs mt-2">
                          ⚡ Multi-segment mode: Video will be generated in chunks
                        </p>
                      )}
                    </div>

                    {/* Orientation */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Orientation
                      </label>
                      <div className="flex gap-2">
                        {['vertical', 'horizontal', 'square'].map((o) => (
                          <button
                            key={o}
                            onClick={() => setOrientation(o)}
                            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-all ${
                              orientation === o
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {o.charAt(0).toUpperCase() + o.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Audio URL (optional) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Audio URL (optional)
                      </label>
                      <input
                        type="url"
                        value={audioUrl}
                        onChange={(e) => setAudioUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Lyrics Toggle */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showLyrics}
                          onChange={(e) => setShowLyrics(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-gray-300">Show lyrics overlay</span>
                      </label>
                    </div>

                    {/* Create Button */}
                    <button
                      onClick={handleCreate}
                      disabled={creating || !prompt.trim()}
                      className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Creating Video...
                        </>
                      ) : (
                        <>
                          <Video className="w-5 h-5" />
                          Create Video
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CURRENT TAB */}
        {activeTab === 'current' && (
          <div>
            <div className="mb-4">
              <h3 className="text-xl font-bold text-white">Current Videos</h3>
              <p className="text-gray-400 text-sm mt-1">Videos being processed</p>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              </div>
            )}

            {!loading && current.length === 0 && (
              <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center">
                <Clock className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No videos currently processing</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  Create New Video
                </button>
              </div>
            )}

            {!loading && current.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {current.map(video => renderVideoCard(video))}
              </div>
            )}
          </div>
        )}

        {/* RECENT TAB */}
        {activeTab === 'recent' && (
          <div>
            <div className="mb-4">
              <h3 className="text-xl font-bold text-white">Recent Videos</h3>
              <p className="text-gray-400 text-sm mt-1">Completed and failed videos</p>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              </div>
            )}

            {!loading && recent.length === 0 && (
              <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center">
                <Video className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No completed videos yet</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  Create Your First Video
                </button>
              </div>
            )}

            {!loading && recent.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recent.map(video => renderVideoCard(video))}
              </div>
            )}
          </div>
        )}

        {/* EDITOR TAB */}
        {activeTab === 'editor' && (
          <div>
            {!selectedVideo ? (
              <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
                <div className="text-center mb-6">
                  <Film className="w-16 h-16 text-gray-600 mx-auto mb-3" />
                  <h3 className="text-xl font-bold text-white mb-2">No Video Selected</h3>
                  <p className="text-gray-400 text-sm">Select a video from Current or Recent to edit</p>
                </div>

                <div className="max-w-2xl mx-auto">
                  <h4 className="text-white font-medium mb-3">Recent Videos</h4>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {all.slice(0, 10).map(video => (
                      <button
                        key={video.id}
                        onClick={() => handleSelectVideo(video.id, false)}
                        className="w-full text-left p-3 bg-gray-900 hover:bg-gray-700 rounded border border-gray-700 transition-colors"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex-1 mr-2">
                            <p className="text-white font-medium text-sm">
                              {video.title || `Video ${video.id.substring(0, 8)}`}
                            </p>
                            <p className="text-gray-400 text-xs mt-1 line-clamp-1">{video.prompt}</p>
                          </div>
                          {renderStatusBadge(video)}
                        </div>
                      </button>
                    ))}
                    {all.length === 0 && (
                      <p className="text-gray-500 text-sm text-center py-4">No videos yet</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {selectedVideo.title || `Video ${selectedVideo.id.substring(0, 8)}`}
                    </h3>
                    <p className="text-gray-400 text-sm mt-1">{selectedVideo.prompt}</p>
                  </div>
                  <button
                    onClick={() => setSelectedVideoId(null)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded border border-gray-700 transition-colors"
                  >
                    Close Editor
                  </button>
                </div>

                {/* Show video player if video_url exists */}
                {selectedVideo.video_url ? (
                  <div className="space-y-4">
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                      <video
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full rounded-lg bg-black"
                        src={selectedVideo.video_url}
                      />
                    </div>

                    <div className="flex gap-3">
                      <a
                        href={selectedVideo.video_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center justify-center gap-2"
                      >
                        <Play className="w-4 h-4" />
                        Open in new tab
                      </a>
                      <button
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = selectedVideo.video_url;
                          a.download = `${selectedVideo.title || 'video'}.mp4`;
                          a.click();
                        }}
                        className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors flex items-center justify-center gap-2"
                      >
                        <Video className="w-4 h-4" />
                        Download
                      </button>
                    </div>

                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                      <h4 className="text-white font-medium mb-2">Video Details</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Status:</span>
                          {renderStatusBadge(selectedVideo)}
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Model:</span>
                          <span className="text-white">{selectedVideo.model}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Duration:</span>
                          <span className="text-white">{selectedVideo.seconds}s</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Created:</span>
                          <span className="text-white">
                            {new Date(selectedVideo.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : getEffectiveStatus(selectedVideo) === 'failed' ? (
                  <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                    <p className="text-white font-medium mb-2">Video generation failed</p>
                    {selectedVideo.error_message && (
                      <p className="text-red-400 text-sm">{selectedVideo.error_message}</p>
                    )}
                    <button
                      onClick={() => setActiveTab('recent')}
                      className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                    >
                      Back to Recent
                    </button>
                  </div>
                ) : (
                  <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto mb-3" />
                    <p className="text-white font-medium mb-2">Video processing</p>
                    <div className="flex justify-center mb-4">
                      {renderStatusBadge(selectedVideo)}
                    </div>
                    <p className="text-gray-400 text-sm mb-4">
                      This page will automatically update when the video is ready
                    </p>
                    <button
                      onClick={() => setActiveTab('current')}
                      className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                    >
                      Back to Current
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
