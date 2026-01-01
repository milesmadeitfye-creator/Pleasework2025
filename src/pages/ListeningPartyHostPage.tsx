import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { Copy, Check, Video, Mic, Users, Circle, Globe, Lock } from 'lucide-react';

type Party = {
  id: string;
  title: string;
  public_slug: string;
  share_path?: string;
  is_public: boolean;
  is_live: boolean;
  status: 'draft' | 'live' | 'ended' | 'archived' | string;
  user_id: string;
  host_display_name?: string;
  current_track_url?: string;
  spotify_track_url?: string;
  stream_url?: string;
  created_at: string;
};

export default function ListeningPartyHostPage() {
  const { partyId } = useParams<{ partyId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [party, setParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const [copied, setCopied] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const [selectedMicId, setSelectedMicId] = useState<string>('default');
  const [selectedCamId, setSelectedCamId] = useState<string>('default');
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch party details and verify ownership
  useEffect(() => {
    if (!partyId || !user) return;

    const fetchParty = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('listening_parties')
          .select('*')
          .eq('id', partyId)
          .maybeSingle();

        if (fetchError) {
          console.error('[ListeningPartyHostPage] Fetch error:', fetchError);
          setError(`Database error: ${fetchError.message}`);
          return;
        }

        if (!data) {
          setError('Party not found.');
          return;
        }

        // Verify ownership - check owner_user_id OR host_user_id OR user_id (legacy)
        const isOwner = data.owner_user_id === user.id;
        const isHost = data.host_user_id === user.id;
        const isLegacyUser = data.user_id === user.id;

        if (!isOwner && !isHost && !isLegacyUser) {
          console.error('[ListeningPartyHostPage] Authorization failed:', {
            party_owner_user_id: data.owner_user_id,
            party_host_user_id: data.host_user_id,
            party_user_id: data.user_id,
            current_user_id: user.id
          });
          setError('You are not the host of this party. Only the host can access this page.');
          return;
        }

        console.log('[ListeningPartyHostPage] Authorization passed:', {
          isOwner,
          isHost,
          isLegacyUser
        });

        setParty(data as Party);
        console.log('[ListeningPartyHostPage] Party loaded:', data);
      } catch (err: any) {
        console.error('[ListeningPartyHostPage] Error:', err);
        setError(err?.message || 'Failed to load party.');
      } finally {
        setLoading(false);
      }
    };

    fetchParty();
  }, [partyId, user]);

  // Enumerate devices on mount
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        // First request permission to unlock device labels
        const tempStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        // Stop temporary stream immediately
        tempStream.getTracks().forEach(track => track.stop());

        // Now enumerate with proper labels
        const devices = await navigator.mediaDevices.enumerateDevices();

        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        const videoInputs = devices.filter(d => d.kind === 'videoinput');

        setMics(audioInputs);
        setCams(videoInputs);

        // Auto-select first device (never use 'default' if real devices exist)
        if (audioInputs.length > 0 && (!selectedMicId || selectedMicId === 'default')) {
          setSelectedMicId(audioInputs[0].deviceId);
          console.log('[ListeningPartyHostPage] Auto-selected mic:', audioInputs[0].label || audioInputs[0].deviceId);
        }
        if (videoInputs.length > 0 && (!selectedCamId || selectedCamId === 'default')) {
          setSelectedCamId(videoInputs[0].deviceId);
          console.log('[ListeningPartyHostPage] Auto-selected camera:', videoInputs[0].label || videoInputs[0].deviceId);
        }

        setDevicesLoaded(true);
        setPermissionDenied(false);

        console.log('[ListeningPartyHostPage] Devices enumerated:', {
          mics: audioInputs.length,
          cams: videoInputs.length,
        });
      } catch (err: any) {
        console.error('[ListeningPartyHostPage] Device enumeration failed:', err);
        setPermissionDenied(true);
        setError('Camera/mic permissions denied. Please allow access in your browser.');
      }
    };

    enumerateDevices();

    // Listen for device changes
    const handleDeviceChange = () => {
      console.log('[ListeningPartyHostPage] Devices changed, re-enumerating...');
      enumerateDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, []);

  // Setup camera/mic preview with proper constraints
  useEffect(() => {
    if (!cameraEnabled && !micEnabled) {
      // Stop all tracks if both disabled
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      return;
    }

    const setupMedia = async () => {
      try {
        // Build safe constraints with minimum resolution >= 240px
        const constraints: MediaStreamConstraints = {};

        if (cameraEnabled) {
          constraints.video = {
            width: { ideal: 1280, min: 240 },
            height: { ideal: 720, min: 240 },
            ...(selectedCamId !== 'default' ? { deviceId: { exact: selectedCamId } } : {}),
          };
        } else {
          constraints.video = false;
        }

        if (micEnabled) {
          constraints.audio = {
            ...(selectedMicId !== 'default' ? { deviceId: { exact: selectedMicId } } : {}),
          };
        } else {
          constraints.audio = false;
        }

        console.log('[ListeningPartyHostPage] Getting media with constraints:', constraints);

        let newStream: MediaStream | null = null;

        try {
          newStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (exactErr: any) {
          // Fallback: retry without exact deviceId constraints
          console.warn('[ListeningPartyHostPage] Exact device constraints failed, retrying without exact:', exactErr);

          const fallbackConstraints: MediaStreamConstraints = {};
          if (cameraEnabled) {
            fallbackConstraints.video = {
              width: { ideal: 1280, min: 240 },
              height: { ideal: 720, min: 240 },
            };
          }
          if (micEnabled) {
            fallbackConstraints.audio = true;
          }

          newStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        }

        setStream(newStream);

        if (videoRef.current && cameraEnabled && newStream) {
          videoRef.current.srcObject = newStream;
        }

        console.log('[ListeningPartyHostPage] Media stream started');
      } catch (err: any) {
        console.error('[ListeningPartyHostPage] Media error:', err);
        setError(`Camera/mic access denied: ${err.message}`);
        setCameraEnabled(false);
        setMicEnabled(false);
      }
    };

    setupMedia();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraEnabled, micEnabled, selectedCamId, selectedMicId]);

  // Update video element when stream changes
  useEffect(() => {
    if (videoRef.current && stream && cameraEnabled) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, cameraEnabled]);

  const handleGoLive = async () => {
    if (!party || updating) return;

    // Validation: check devices are ready
    if (!devicesLoaded) {
      setError('Devices not loaded yet. Please wait...');
      return;
    }

    if (permissionDenied) {
      setError('Allow camera/mic permissions in browser to go live.');
      return;
    }

    // Validation: must have both mic and camera enabled
    if (!micEnabled) {
      setError('Turn on your microphone to go live.');
      return;
    }

    if (!cameraEnabled) {
      setError('Turn on your camera to go live.');
      return;
    }

    if (!stream) {
      setError('Preview stream not started. Enable camera and mic first.');
      return;
    }

    if (mics.length === 0) {
      setError('No microphone detected. Please connect a microphone.');
      return;
    }

    if (cams.length === 0) {
      setError('No camera detected. Please connect a camera.');
      return;
    }

    if (!selectedMicId || selectedMicId === 'default') {
      setError('Please select a microphone from the dropdown.');
      return;
    }

    if (!selectedCamId || selectedCamId === 'default') {
      setError('Please select a camera from the dropdown.');
      return;
    }

    try {
      setUpdating(true);
      setError(null);

      console.log('[ListeningPartyHostPage] GoLive payload:', {
        partyId: party.id,
        selectedMicId,
        selectedCamId,
        micEnabled,
        cameraEnabled,
        micCount: mics.length,
        camCount: cams.length,
        streamTracks: stream?.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, label: t.label }))
      });

      // Get auth session
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      if (!session) {
        throw new Error('Please log in to start a live stream');
      }

      // Clamp resolution to safe values
      const width = Math.max(240, 1280);
      const height = Math.max(240, 720);

      // Create Stream video room/call via backend
      const res = await fetch('/.netlify/functions/listening-party-create-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          partyId: party.id,
          micDeviceId: selectedMicId,
          camDeviceId: selectedCamId,
          micEnabled,
          cameraEnabled,
          width,
          height,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        // Better error messages for known issues
        let errorMsg = data.error || 'Failed to create video stream';

        if (errorMsg.includes('audio.default_device')) {
          errorMsg = 'Select a microphone to go live.';
        } else if (errorMsg.includes('target_resolution')) {
          errorMsg = 'Video resolution too low. Switch camera or refresh.';
        }

        throw new Error(errorMsg);
      }

      console.log('[ListeningPartyHostPage] Video stream created:', data);

      // Refresh party data to get updated stream_url, stream_app_id, status, and is_live
      const { data: updatedParty, error: refetchError } = await supabase
        .from('listening_parties')
        .select('*')
        .eq('id', party.id)
        .maybeSingle();

      if (refetchError) {
        console.error('[ListeningPartyHostPage] Refetch error after Go Live:', refetchError);
        // Still update local state with known changes even if refetch fails
        setParty((p) => p ? {
          ...p,
          is_live: true,
          status: 'live',
          is_public: true,
          stream_app_id: data.stream_app_id || p.stream_app_id,
          stream_url: data.stream_url || p.stream_url,
        } : null);
        console.log('[ListeningPartyHostPage] Party is now live (fallback state update)');
      } else if (updatedParty) {
        setParty(updatedParty as Party);
        console.log('[ListeningPartyHostPage] Party is now live! Status:', updatedParty.status, 'is_live:', updatedParty.is_live);
      } else {
        // Refetch returned no data - use fallback state
        console.warn('[ListeningPartyHostPage] Refetch returned no data, using fallback state');
        setParty((p) => p ? {
          ...p,
          is_live: true,
          status: 'live',
          is_public: true,
          stream_app_id: data.stream_app_id || p.stream_app_id,
          stream_url: data.stream_url || p.stream_url,
        } : null);
      }
    } catch (err: any) {
      console.error('[ListeningPartyHostPage] Go Live error:', err);
      setError(`Failed to go live: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleEndLive = async () => {
    if (!party || updating) return;

    try {
      setUpdating(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('listening_parties')
        .update({
          is_live: false,
          status: 'ended',
          ended_at: new Date().toISOString(),
        })
        .eq('id', party.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      // Refresh party data
      const { data } = await supabase
        .from('listening_parties')
        .select('*')
        .eq('id', party.id)
        .single();

      if (data) {
        setParty(data as Party);
        console.log('[ListeningPartyHostPage] Party ended.');
      }
    } catch (err: any) {
      console.error('[ListeningPartyHostPage] End Live error:', err);
      setError(`Failed to end live: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleTogglePublic = async (nextPublic: boolean) => {
    if (!party || updating) return;

    try {
      setUpdating(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('listening_parties')
        .update({ is_public: nextPublic })
        .eq('id', party.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setParty((p) => (p ? { ...p, is_public: nextPublic } : null));
      console.log('[ListeningPartyHostPage] Public toggled:', nextPublic);
    } catch (err: any) {
      console.error('[ListeningPartyHostPage] Toggle public error:', err);
      setError(`Failed to update privacy: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleCopyInviteLink = () => {
    if (!party) return;

    const inviteUrl = `${window.location.origin}/live/${party.public_slug}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      console.log('[ListeningPartyHostPage] Copied invite link:', inviteUrl);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0A0E1A] to-[#1a1f2e] flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-ghoste-accent"></div>
      </div>
    );
  }

  if (error && !party) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0A0E1A] to-[#1a1f2e] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold text-red-400 mb-3">Error</h2>
          <p className="text-gray-300 mb-4">{error}</p>
          <button
            onClick={() => navigate('/studio/listening-parties')}
            className="px-6 py-2 bg-ghoste-accent text-white rounded-lg hover:bg-ghoste-accent/90 transition"
          >
            Back to Listening Parties
          </button>
        </div>
      </div>
    );
  }

  if (!party) {
    return null;
  }

  const inviteUrl = `${window.location.origin}/live/${party.public_slug}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0A0E1A] to-[#1a1f2e] py-12 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold text-white">
            Host: {party.title}
          </h1>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {/* Live Status Badge */}
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-full ${
                party.is_live || party.status === 'live'
                  ? 'bg-green-500/20 border border-green-500/30'
                  : party.status === 'ended'
                  ? 'bg-red-500/20 border border-red-500/30'
                  : party.status === 'archived'
                  ? 'bg-gray-500/20 border border-gray-500/30'
                  : 'bg-yellow-500/20 border border-yellow-500/30'
              }`}
            >
              <Circle
                className={`w-3 h-3 fill-current ${
                  party.is_live || party.status === 'live'
                    ? 'text-green-400'
                    : party.status === 'ended'
                    ? 'text-red-400'
                    : party.status === 'archived'
                    ? 'text-gray-400'
                    : 'text-yellow-400'
                }`}
              />
              <span
                className={
                  party.is_live || party.status === 'live'
                    ? 'text-green-400'
                    : party.status === 'ended'
                    ? 'text-red-400'
                    : party.status === 'archived'
                    ? 'text-gray-400'
                    : 'text-yellow-400'
                }
              >
                {(party.status || 'draft').toUpperCase()}
              </span>
            </div>

            {/* Public/Private Badge */}
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-full ${
                party.is_public
                  ? 'bg-blue-500/20 border border-blue-500/30'
                  : 'bg-gray-500/20 border border-gray-500/30'
              }`}
            >
              {party.is_public ? (
                <Globe className="w-4 h-4 text-blue-400" />
              ) : (
                <Lock className="w-4 h-4 text-gray-400" />
              )}
              <span className={party.is_public ? 'text-blue-400' : 'text-gray-400'}>
                {party.is_public ? 'PUBLIC' : 'PRIVATE'}
              </span>
            </div>

            {/* Host View Badge */}
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-full">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-gray-300 text-sm">Host View</span>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-red-400 text-center">{error}</p>
          </div>
        )}

        {/* Camera/Mic Preview */}
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Video className="w-5 h-5" />
            Camera & Mic Preview
          </h2>

          {/* Device Selection */}
          {devicesLoaded && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Microphone
                </label>
                <select
                  value={selectedMicId}
                  onChange={(e) => setSelectedMicId(e.target.value)}
                  className="w-full bg-[#0A0E1A] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  disabled={mics.length === 0}
                >
                  {mics.length === 0 ? (
                    <option value="">No microphones detected</option>
                  ) : (
                    mics.map((mic) => (
                      <option key={mic.deviceId} value={mic.deviceId}>
                        {mic.label || `Microphone ${mic.deviceId.slice(0, 8)}`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Camera
                </label>
                <select
                  value={selectedCamId}
                  onChange={(e) => setSelectedCamId(e.target.value)}
                  className="w-full bg-[#0A0E1A] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  disabled={cams.length === 0}
                >
                  {cams.length === 0 ? (
                    <option value="">No cameras detected</option>
                  ) : (
                    cams.map((cam) => (
                      <option key={cam.deviceId} value={cam.deviceId}>
                        {cam.label || `Camera ${cam.deviceId.slice(0, 8)}`}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          )}

          {permissionDenied && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-yellow-300 text-sm text-center">
                Camera/mic permissions denied. Please allow access in your browser settings.
              </p>
            </div>
          )}

          {!devicesLoaded && !permissionDenied && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <p className="text-blue-300 text-sm text-center">
                Loading devices...
              </p>
            </div>
          )}

          {/* Video Preview */}
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            {cameraEnabled ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-gray-500">Camera off</p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-4">
            <button
              onClick={() => setCameraEnabled(!cameraEnabled)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition ${
                cameraEnabled
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              <Video className="w-5 h-5" />
              {cameraEnabled ? 'Camera On' : 'Camera Off'}
            </button>
            <button
              onClick={() => setMicEnabled(!micEnabled)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition ${
                micEnabled
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              <Mic className="w-5 h-5" />
              {micEnabled ? 'Mic On' : 'Mic Off'}
            </button>
          </div>

          <p className="text-sm text-gray-400 text-center">
            This is a preview only. Toggle camera and mic to test your setup.
          </p>
        </div>

        {/* Actions */}
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white">Actions</h2>

          {/* Public Toggle */}
          <div className="flex items-center justify-between p-4 bg-[#0A0E1A] border border-gray-700 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {party.is_public ? (
                  <Globe className="w-4 h-4 text-blue-400" />
                ) : (
                  <Lock className="w-4 h-4 text-gray-400" />
                )}
                <label className="text-sm font-medium text-gray-300">
                  Public party
                </label>
              </div>
              <p className="text-xs text-gray-500">
                Fans can only join when the party is public.
              </p>
            </div>
            <button
              onClick={() => handleTogglePublic(!party.is_public)}
              disabled={updating}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                party.is_public ? 'bg-blue-600' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  party.is_public ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Copy Invite Link */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Invite Link (Share with fans)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteUrl}
                readOnly
                className="flex-1 px-4 py-2 bg-[#0A0E1A] border border-gray-700 rounded-lg text-gray-300 text-sm"
              />
              <button
                onClick={handleCopyInviteLink}
                className="px-4 py-2 bg-ghoste-accent hover:bg-ghoste-accent/90 text-white rounded-lg transition flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
              {!party.is_public && (
                <button
                  onClick={() => handleTogglePublic(true)}
                  disabled={updating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded-lg transition"
                >
                  Make Public
                </button>
              )}
            </div>

            {/* Status messaging */}
            {!party.is_public ? (
              <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <Lock className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-yellow-300">
                  <strong>Private</strong> — fans cannot join yet. Toggle Public or click Go Live.
                </p>
              </div>
            ) : party.status !== 'live' && !party.is_live ? (
              <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <Globe className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-300">
                  <strong>Public</strong> — fans can view the page, but it's not live yet.
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                Link is live! Share with your fans to join.
              </p>
            )}
          </div>

          {/* Go Live / End Live */}
          <div className="flex gap-4">
            {!party.is_live ? (
              <>
                <button
                  onClick={handleGoLive}
                  disabled={
                    updating ||
                    !devicesLoaded ||
                    permissionDenied ||
                    mics.length === 0 ||
                    cams.length === 0 ||
                    !stream ||
                    !selectedMicId ||
                    selectedMicId === 'default' ||
                    !selectedCamId ||
                    selectedCamId === 'default' ||
                    !micEnabled ||
                    !cameraEnabled
                  }
                  className="flex-1 px-6 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition"
                  title={
                    !devicesLoaded
                      ? 'Loading devices...'
                      : permissionDenied
                      ? 'Allow camera/mic permissions'
                      : mics.length === 0 || cams.length === 0
                      ? 'No devices detected'
                      : !micEnabled || !cameraEnabled
                      ? 'Turn on camera and mic first'
                      : !stream
                      ? 'Enable camera and mic preview first'
                      : 'Go Live'
                  }
                >
                  {updating ? 'Starting...' : 'Go Live'}
                </button>
                {(!devicesLoaded || permissionDenied || mics.length === 0 || cams.length === 0 || !micEnabled || !cameraEnabled) && (
                  <div className="flex-1 text-xs text-gray-400 flex items-center justify-center">
                    {!devicesLoaded
                      ? 'Loading devices...'
                      : permissionDenied
                      ? 'Allow permissions to go live'
                      : mics.length === 0 || cams.length === 0
                      ? 'Connect camera/mic to go live'
                      : 'Turn on camera and mic to go live'}
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={handleEndLive}
                disabled={updating}
                className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition"
              >
                {updating ? 'Ending...' : 'End Live'}
              </button>
            )}
          </div>
        </div>

        {/* Party Info */}
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-6 space-y-3">
          <h2 className="text-xl font-semibold text-white">Party Info</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Party ID:</span>
              <span className="text-gray-300 font-mono text-xs">{party.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Public Slug:</span>
              <span className="text-gray-300 font-mono text-xs">{party.public_slug}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status:</span>
              <span className="text-gray-300">{party.is_live ? 'Live' : 'Not Live'}</span>
            </div>
            {party.current_track_url && (
              <div className="flex justify-between">
                <span className="text-gray-400">Track URL:</span>
                <a
                  href={party.current_track_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ghoste-accent hover:underline text-xs truncate max-w-xs"
                >
                  {party.current_track_url}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Back Button */}
        <div className="text-center">
          <button
            onClick={() => navigate('/studio/listening-parties')}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
          >
            Back to Listening Parties
          </button>
        </div>
      </div>
    </div>
  );
}
