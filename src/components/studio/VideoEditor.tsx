import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

type Caption = {
  startMs: number;
  endMs: number;
  text: string;
  x: number;
  y: number;
  style: string;
};

type EditJson = {
  targetSeconds: number;
  captions: Caption[];
  cutMarkers: number[];
  overlay?: {
    enabled: boolean;
    position: string;
    style: string;
  };
  showLyrics?: boolean;
  audioUrl?: string;
};

type Segment = {
  idx: number;
  seconds: number;
  status: string;
  url: string | null;
};

type VideoEditorProps = {
  videoId: string;
  videoUrl: string;
  segments?: Segment[]; // NEW: For multi-segment playback
  targetSeconds?: number; // NEW: User requested duration
  onClose?: () => void;
};

export function VideoEditor({ videoId, videoUrl, segments, targetSeconds, onClose }: VideoEditorProps) {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [editJson, setEditJson] = useState<EditJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'captions' | 'lyrics' | 'cuts' | 'export'>('captions');
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedCaptionIndex, setSelectedCaptionIndex] = useState<number | null>(null);
  const [lyrics, setLyrics] = useState('');
  const [bpm, setBpm] = useState(120);

  // Multi-segment playback state
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [segmentOffset, setSegmentOffset] = useState(0);
  const [globalTime, setGlobalTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Determine if this is multi-segment
  const isMultiSegment = segments && segments.length > 1;
  const completedSegments = segments?.filter(s => s.status === 'completed' && s.url) || [];
  const currentSegmentUrl = isMultiSegment && completedSegments[currentSegmentIndex]
    ? completedSegments[currentSegmentIndex].url
    : videoUrl;

  useEffect(() => {
    loadEdit();
  }, [videoId]);

  // Update video src when segment changes
  useEffect(() => {
    const video = videoRef.current;
    if (video && currentSegmentUrl) {
      video.src = currentSegmentUrl;
      video.load();
    }
  }, [currentSegmentUrl]);

  // Handle time updates and segment transitions
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const localTime = video.currentTime * 1000;
      setCurrentTime(localTime);

      // Calculate global time across all segments
      const globalMs = segmentOffset + localTime;
      setGlobalTime(globalMs);
    };

    const handleEnded = () => {
      if (isMultiSegment && currentSegmentIndex < completedSegments.length - 1) {
        // Move to next segment
        const currentSegment = completedSegments[currentSegmentIndex];
        const newOffset = segmentOffset + (currentSegment.seconds * 1000);
        setSegmentOffset(newOffset);
        setCurrentSegmentIndex(currentSegmentIndex + 1);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [isMultiSegment, currentSegmentIndex, completedSegments, segmentOffset]);

  const loadEdit = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('video_edits')
        .select('*')
        .eq('video_id', videoId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;

      setMode(data.mode as 'auto' | 'manual');
      setEditJson(data.edit_json as EditJson);
    } catch (err: any) {
      console.error('Load edit error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoGenerate = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/.netlify/functions/video-editor-autogen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          video_id: videoId,
          lyrics: lyrics || null,
          caption_style: 'minimal',
          beat_sync: true,
          bpm: bpm,
        }),
      });

      if (!response.ok) throw new Error('Auto-generate failed');

      const result = await response.json();
      setEditJson(result.edit_json);
      setMode('auto');
      alert('Auto-generated captions and cuts!');
    } catch (err: any) {
      console.error('Auto-generate error:', err);
      alert('Failed to auto-generate: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveManualEdit = async () => {
    if (!editJson) return;

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/.netlify/functions/video-editor-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          video_id: videoId,
          patch: {
            captions: editJson.captions,
            cutMarkers: editJson.cutMarkers,
            overlay: editJson.overlay,
          },
        }),
      });

      if (!response.ok) throw new Error('Save failed');

      const result = await response.json();
      setMode('manual');
      alert('Manual edits saved!');
    } catch (err: any) {
      console.error('Save error:', err);
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCaptionTextChange = (index: number, newText: string) => {
    if (!editJson) return;
    const newCaptions = [...editJson.captions];
    newCaptions[index] = { ...newCaptions[index], text: newText };
    setEditJson({ ...editJson, captions: newCaptions });
  };

  const handleCaptionTimeChange = (index: number, field: 'startMs' | 'endMs', value: number) => {
    if (!editJson) return;
    const newCaptions = [...editJson.captions];
    newCaptions[index] = { ...newCaptions[index], [field]: value };
    setEditJson({ ...editJson, captions: newCaptions });
  };

  const getCurrentCaption = () => {
    if (!editJson) return null;
    return editJson.captions.find(
      (c) => c.startMs <= currentTime && currentTime <= c.endMs
    );
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <p className="text-gray-400">Loading editor...</p>
      </div>
    );
  }

  if (!editJson) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <p className="text-gray-400">No edit data available</p>
      </div>
    );
  }

  const currentCaption = getCurrentCaption();

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden relative z-20 pointer-events-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between relative z-10 pointer-events-auto">
        <h3 className="text-xl font-bold text-white">Video Editor</h3>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-900 rounded">
            <button
              onClick={() => setMode('auto')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                mode === 'auto'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              AUTO
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                mode === 'manual'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              MANUAL
            </button>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Video Player */}
      <div className="relative bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          className="w-full max-h-96 object-contain"
        />
        {/* Caption Overlay */}
        {currentCaption && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${currentCaption.x}%`,
              top: `${currentCaption.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="bg-black bg-opacity-75 text-white px-4 py-2 rounded text-center font-bold">
              {currentCaption.text}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {(['captions', 'lyrics', 'cuts', 'export'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-gray-900 text-white border-b-2 border-blue-600'
                : 'text-gray-400 hover:text-white hover:bg-gray-750'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-96 overflow-y-auto relative z-10 pointer-events-auto">
        {activeTab === 'captions' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-400">
                {editJson.captions.length} caption(s)
              </p>
              {mode === 'manual' && (
                <button
                  onClick={handleSaveManualEdit}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white px-4 py-2 rounded text-sm transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>

            {editJson.captions.map((caption, i) => (
              <div
                key={i}
                className={`bg-gray-900 rounded p-3 border ${
                  i === selectedCaptionIndex ? 'border-blue-600' : 'border-gray-700'
                }`}
                onClick={() => setSelectedCaptionIndex(i)}
              >
                <div className="flex gap-2 mb-2">
                  <input
                    type="number"
                    value={Math.round(caption.startMs / 1000)}
                    onChange={(e) =>
                      handleCaptionTimeChange(i, 'startMs', Number(e.target.value) * 1000)
                    }
                    disabled={mode === 'auto'}
                    className="w-20 px-2 py-1 bg-gray-800 text-white text-xs rounded border border-gray-700 disabled:opacity-50"
                    placeholder="Start (s)"
                  />
                  <input
                    type="number"
                    value={Math.round(caption.endMs / 1000)}
                    onChange={(e) =>
                      handleCaptionTimeChange(i, 'endMs', Number(e.target.value) * 1000)
                    }
                    disabled={mode === 'auto'}
                    className="w-20 px-2 py-1 bg-gray-800 text-white text-xs rounded border border-gray-700 disabled:opacity-50"
                    placeholder="End (s)"
                  />
                </div>
                <input
                  type="text"
                  value={caption.text}
                  onChange={(e) => handleCaptionTextChange(i, e.target.value)}
                  disabled={mode === 'auto'}
                  className="w-full px-2 py-1 bg-gray-800 text-white text-sm rounded border border-gray-700 disabled:opacity-50 pointer-events-auto"
                  placeholder="Caption text..."
                />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'lyrics' && (
          <div className="space-y-4">
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Enter lyrics (one line per cue)..."
              className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 resize-none pointer-events-auto"
              rows={8}
            />
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-400">BPM:</label>
              <input
                type="number"
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-20 px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded text-sm"
                min="60"
                max="200"
              />
              <button
                onClick={handleAutoGenerate}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white px-4 py-2 rounded text-sm transition-colors"
              >
                {saving ? 'Generating...' : 'Generate from Lyrics'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'cuts' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400 mb-4">
              {editJson.cutMarkers.length} cut marker(s)
            </p>
            <div className="flex flex-wrap gap-2">
              {editJson.cutMarkers.map((marker, i) => (
                <div
                  key={i}
                  className="bg-gray-900 px-3 py-2 rounded text-sm text-white border border-gray-700"
                >
                  {marker.toFixed(2)}s
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'export' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">Export options coming soon...</p>
            <div className="bg-gray-900 rounded p-4 border border-gray-700">
              <p className="text-xs text-gray-400 mb-2">Current Edit Info:</p>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>Target Duration: {editJson.targetSeconds}s</li>
                <li>Mode: {mode.toUpperCase()}</li>
                <li>Captions: {editJson.captions.length}</li>
                <li>Cut Markers: {editJson.cutMarkers.length}</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
