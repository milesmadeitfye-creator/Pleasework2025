import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Video, VideoOff, Mic, MicOff, Users, Signal, Wifi, WifiOff, Play, Square } from 'lucide-react';

type Participant = {
  id: string;
  party_id: string;
  display_name: string;
  role: string;
  is_connected: boolean;
  created_at: string;
};

type ListeningPartyCreatorWebRTCProps = {
  partyId: string;
  partyTitle: string;
  userId: string;
  userName: string;
  onLeave?: () => void;
};

export default function ListeningPartyCreatorWebRTC({
  partyId,
  partyTitle,
  userId,
  userName,
  onLeave,
}: ListeningPartyCreatorWebRTCProps) {
  const [myParticipant, setMyParticipant] = useState<Participant | null>(null);
  const [viewers, setViewers] = useState<Participant[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [enableCamera, setEnableCamera] = useState(true);
  const [enableMic, setEnableMic] = useState(true);

  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const sessionIdRef = useRef<string>(`creator-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Debug state
  const [signalsSent, setSignalsSent] = useState(0);
  const [connectedViewers, setConnectedViewers] = useState(0);

  // Join as creator
  useEffect(() => {
    (async () => {
      try {
        console.log('[Creator] Joining party as creator');

        const joinRes = await fetch('/.netlify/functions/listening-party-join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            party_id: partyId,
            display_name: userName,
            role: 'creator',
            session_id: sessionIdRef.current,
          }),
        });

        const joinData = await joinRes.json();
        if (!joinData.ok) {
          throw new Error(joinData.error || 'Failed to join as creator');
        }

        setMyParticipant(joinData.participant);
        console.log('[Creator] Joined as creator:', joinData.participant.id);
      } catch (e) {
        console.error('[Creator] Join error:', e);
      }
    })();
  }, [partyId, userName]);

  // Monitor viewers joining
  useEffect(() => {
    if (!myParticipant) return;

    console.log('[Creator] Setting up viewer monitoring');

    // Load initial viewers
    (async () => {
      const { data } = await supabase
        .from('listening_party_participants')
        .select('*')
        .eq('party_id', partyId)
        .eq('role', 'viewer')
        .order('created_at', { ascending: true });

      if (data) {
        setViewers(data);
        console.log('[Creator] Initial viewers:', data.length);
      }
    })();

    // Subscribe to new viewers
    const channel = supabase
      .channel(`participants-creator-${partyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'listening_party_participants',
          filter: `party_id=eq.${partyId}`,
        },
        async (payload) => {
          const newParticipant = payload.new as Participant;

          if (newParticipant.role === 'viewer') {
            console.log('[Creator] New viewer joined:', newParticipant.id);
            setViewers((prev) => [...prev, newParticipant]);

            // If we're live, send offer to new viewer
            if (isLive && localStreamRef.current) {
              await createPeerConnectionForViewer(newParticipant.id);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myParticipant, partyId, isLive]);

  // Create peer connection for a viewer
  const createPeerConnectionForViewer = async (viewerId: string) => {
    if (!myParticipant || !localStreamRef.current) {
      console.warn('[Creator] Cannot create PC: no participant or stream');
      return;
    }

    console.log('[Creator] Creating peer connection for viewer:', viewerId);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    // Add local tracks
    localStreamRef.current.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!);
    });

    console.log('[Creator] Added tracks to PC for viewer:', viewerId);

    // Send ICE candidates
    pc.onicecandidate = async (ev) => {
      if (!ev.candidate) return;

      console.log('[Creator] Sending ICE to viewer:', viewerId);
      await supabase.from('listening_party_signals').insert({
        party_id: partyId,
        from_participant_id: myParticipant.id,
        to_participant_id: viewerId,
        type: 'ice',
        payload: ev.candidate,
      });
      setSignalsSent((prev) => prev + 1);
    };

    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log('[Creator] PC state for', viewerId, ':', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setConnectedViewers((prev) => prev + 1);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectedViewers((prev) => Math.max(0, prev - 1));
      }
    };

    peerConnectionsRef.current.set(viewerId, pc);

    // Listen for answer and ICE from this viewer
    const signalChannel = supabase
      .channel(`signals-from-${viewerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'listening_party_signals',
          filter: `to_participant_id=eq.${myParticipant.id}`,
        },
        async (payload) => {
          const msg: any = payload.new;

          if (msg.from_participant_id !== viewerId) return;

          console.log('[Creator] Received signal from viewer', viewerId, ':', msg.type);

          if (msg.type === 'answer') {
            try {
              await pc.setRemoteDescription(msg.payload);
              console.log('[Creator] Set remote description for', viewerId);
            } catch (err) {
              console.error('[Creator] Error setting remote description:', err);
            }
          }

          if (msg.type === 'ice') {
            try {
              await pc.addIceCandidate(msg.payload);
            } catch (err) {
              console.error('[Creator] Error adding ICE candidate:', err);
            }
          }
        }
      )
      .subscribe();

    // Create and send offer
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await supabase.from('listening_party_signals').insert({
        party_id: partyId,
        from_participant_id: myParticipant.id,
        to_participant_id: viewerId,
        type: 'offer',
        payload: offer,
      });
      setSignalsSent((prev) => prev + 1);

      console.log('[Creator] Sent offer to viewer:', viewerId);
    } catch (err) {
      console.error('[Creator] Error creating/sending offer:', err);
    }
  };

  // Start streaming
  const handleGoLive = async () => {
    try {
      console.log('[Creator] Starting stream...');

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: enableCamera,
        audio: enableMic,
      });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Update party status to live
      await supabase
        .from('listening_parties')
        .update({
          is_live: true,
          live_started_at: new Date().toISOString(),
        })
        .eq('id', partyId);

      setIsLive(true);
      console.log('[Creator] Stream started');

      // Create peer connections for existing viewers
      for (const viewer of viewers) {
        await createPeerConnectionForViewer(viewer.id);
      }
    } catch (err) {
      console.error('[Creator] Failed to start stream:', err);
      alert('Failed to access camera/microphone. Please check permissions.');
    }
  };

  // Stop streaming
  const handleStopStream = async () => {
    try {
      console.log('[Creator] Stopping stream...');

      // Stop all tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }

      // Close all peer connections
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();

      // Update party status
      await supabase
        .from('listening_parties')
        .update({ is_live: false })
        .eq('id', partyId);

      setIsLive(false);
      setConnectedViewers(0);
      console.log('[Creator] Stream stopped');
    } catch (err) {
      console.error('[Creator] Error stopping stream:', err);
    }
  };

  // Toggle camera
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setEnableCamera(videoTrack.enabled);
      }
    }
  };

  // Toggle mic
  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setEnableMic(audioTrack.enabled);
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      peerConnectionsRef.current.forEach((pc) => pc.close());
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
        <h2 className="text-2xl font-bold mb-2">{partyTitle}</h2>
        <p className="text-gray-400">Creator Dashboard</p>
      </div>

      {/* Local Preview */}
      <div className="bg-black rounded-lg overflow-hidden aspect-video relative">
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-contain"
        />
        {!isLive && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
            <div className="text-center">
              <Video className="w-16 h-16 mx-auto mb-4 text-gray-600" />
              <p className="text-gray-400">Preview will appear here</p>
            </div>
          </div>
        )}
        {isLive && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-500 px-3 py-1 rounded-full">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-sm font-semibold">LIVE</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        {!isLive ? (
          <button
            onClick={handleGoLive}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            <Play className="w-5 h-5" />
            Go Live
          </button>
        ) : (
          <>
            <button
              onClick={toggleCamera}
              className={`p-3 rounded-lg transition-colors ${
                enableCamera
                  ? 'bg-gray-700 hover:bg-gray-600'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {enableCamera ? (
                <Video className="w-5 h-5" />
              ) : (
                <VideoOff className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={toggleMic}
              className={`p-3 rounded-lg transition-colors ${
                enableMic
                  ? 'bg-gray-700 hover:bg-gray-600'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {enableMic ? (
                <Mic className="w-5 h-5" />
              ) : (
                <MicOff className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={handleStopStream}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              <Square className="w-5 h-5" />
              Stop Stream
            </button>
          </>
        )}
      </div>

      {/* Stats & Debug */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Viewer Stats */}
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Viewers
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Joined:</span>
              <span className="font-semibold">{viewers.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Connected:</span>
              <span className="font-semibold text-green-500">{connectedViewers}</span>
            </div>
          </div>
        </div>

        {/* Connection Debug */}
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Signal className="w-5 h-5" />
            Debug
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">My Participant ID:</span>
              <span className="font-mono text-xs text-gray-300">
                {myParticipant?.id.slice(0, 8) || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Signals Sent:</span>
              <span className="font-semibold">{signalsSent}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Peer Connections:</span>
              <span className="font-semibold">{peerConnectionsRef.current.size}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Stream Status:</span>
              <div className="flex items-center gap-2">
                {isLive ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-500" />
                    <span className="text-green-500 font-semibold">Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-500 font-semibold">Offline</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Viewer List */}
      {viewers.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
          <h3 className="text-lg font-semibold mb-3">Active Viewers</h3>
          <div className="space-y-2">
            {viewers.map((viewer) => (
              <div
                key={viewer.id}
                className="flex items-center justify-between p-2 bg-gray-800 rounded"
              >
                <span className="text-gray-300">
                  {viewer.display_name || 'Anonymous'}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(viewer.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
