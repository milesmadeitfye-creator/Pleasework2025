import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { isUuid } from '../lib/isUuid';
import { Music, Users, Signal, Wifi, WifiOff, Lock, Clock } from 'lucide-react';

type Party = {
  id: string;
  title: string;
  host_display_name?: string;
  status: 'draft' | 'live' | 'ended' | 'archived' | string;
  is_live?: boolean;
  is_public?: boolean;
  current_track_title?: string;
};

type Participant = {
  id: string;
  party_id: string;
  display_name: string;
  role: string;
  is_connected: boolean;
};

export default function PublicListeningPartyWebRTC() {
  const { partyId } = useParams<{ partyId: string }>();
  const [party, setParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [myParticipant, setMyParticipant] = useState<Participant | null>(null);
  const [creatorParticipant, setCreatorParticipant] = useState<Participant | null>(null);
  const [viewerCount, setViewerCount] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const sessionIdRef = useRef<string>(`viewer-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Debug state
  const [signalsReceived, setSignalsReceived] = useState(0);
  const [lastSignalType, setLastSignalType] = useState<string>('none');
  const [connectionState, setConnectionState] = useState<string>('new');
  const [iceState, setIceState] = useState<string>('new');

  // Load party details
  useEffect(() => {
    if (!partyId) return;

    (async () => {
      try {
        setLoading(true);
        // Remove 'party-' prefix if present in URL
        const routeParam = partyId.startsWith('party-') ? partyId.replace('party-', '') : partyId;

        console.log('[PublicListeningPartyWebRTC] route param:', routeParam, 'isUuid:', isUuid(routeParam));

        let data = null;
        let fetchError = null;

        // 1) If UUID, allow direct lookup by id (must be public)
        if (isUuid(routeParam)) {
          const result = await supabase
            .from('listening_parties')
            .select('id, title, host_display_name, status, is_live, is_public, current_track_title')
            .eq('is_public', true)
            .eq('id', routeParam)
            .maybeSingle();

          data = result.data;
          fetchError = result.error;

          if (data) {
            console.log('[PublicListeningPartyWebRTC] Found by UUID id:', data);
          }
        }

        // 2) Try share_path (new column)
        if (!data && !fetchError) {
          const result = await supabase
            .from('listening_parties')
            .select('id, title, host_display_name, status, is_live, is_public, current_track_title')
            .eq('is_public', true)
            .eq('share_path', routeParam)
            .maybeSingle();

          data = result.data;
          fetchError = result.error;

          if (data) {
            console.log('[PublicListeningPartyWebRTC] Found by share_path:', data);
          }
        }

        // 3) Try public_slug
        if (!data && !fetchError) {
          const result = await supabase
            .from('listening_parties')
            .select('id, title, host_display_name, status, is_live, is_public, current_track_title')
            .eq('is_public', true)
            .eq('public_slug', routeParam)
            .maybeSingle();

          data = result.data;
          fetchError = result.error;

          if (data) {
            console.log('[PublicListeningPartyWebRTC] Found by public_slug:', data);
          }
        }

        // 4) Fallback to legacy slug column
        if (!data && !fetchError) {
          const result = await supabase
            .from('listening_parties')
            .select('id, title, host_display_name, status, is_live, is_public, current_track_title')
            .eq('is_public', true)
            .eq('slug', routeParam)
            .maybeSingle();

          data = result.data;
          fetchError = result.error;

          if (data) {
            console.log('[PublicListeningPartyWebRTC] Found by legacy slug:', data);
          }
        }

        console.log('[PublicListeningPartyWebRTC] final result:', data);

        if (fetchError) {
          console.error('[PublicListeningPartyWebRTC] Database error:', fetchError);
          console.error('[PublicListeningPartyWebRTC] Error code:', fetchError.code);
          console.error('[PublicListeningPartyWebRTC] Error message:', fetchError.message);
          setError(`Database error: ${fetchError.message} (${fetchError.code || 'unknown'})`);
          return;
        }

        if (!data) {
          console.warn('[PublicListeningPartyWebRTC] Party not found for route param:', routeParam);
          setError('not-found');
          return;
        }

        console.log('[PublicListeningPartyWebRTC] Party found:', data.id);
        setParty(data as Party);
      } catch (e) {
        console.error('[PublicListeningPartyWebRTC] Unexpected error:', e);
        setError('Failed to load party');
      } finally {
        setLoading(false);
      }
    })();
  }, [partyId]);

  // Join party and setup WebRTC
  useEffect(() => {
    if (!party) return;

    let mounted = true;
    let signalChannel: any;

    (async () => {
      try {
        console.log('[PublicListeningParty] Joining party:', party.id);

        // Join party
        const joinRes = await fetch('/.netlify/functions/listening-party-join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            party_id: party.id,
            display_name: 'Listener',
            session_id: sessionIdRef.current,
          }),
        });

        const joinData = await joinRes.json();
        if (!joinData.ok) {
          throw new Error(joinData.error || 'Failed to join party');
        }

        const me = joinData.participant;
        if (!mounted) return;
        setMyParticipant(me);

        console.log('[PublicListeningParty] Joined as participant:', me.id);

        // Get creator participant
        const { data: participants } = await supabase
          .from('listening_party_participants')
          .select('*')
          .eq('party_id', party.id)
          .eq('role', 'creator')
          .maybeSingle();

        if (participants) {
          setCreatorParticipant(participants);
        }

        // Setup peer connection
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });
        pcRef.current = pc;

        // Handle incoming media
        pc.ontrack = (ev) => {
          console.log('[PublicListeningParty] Received track:', ev.track.kind);
          const stream = ev.streams?.[0];
          if (stream && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            console.log('[PublicListeningParty] Set remote stream');
          }
        };

        // Send ICE candidates to creator
        pc.onicecandidate = async (ev) => {
          if (!ev.candidate || !participants) return;

          console.log('[PublicListeningParty] Sending ICE candidate to creator');
          await supabase.from('listening_party_signals').insert({
            party_id: party.id,
            from_participant_id: me.id,
            to_participant_id: participants.id,
            type: 'ice',
            payload: ev.candidate,
          });
        };

        // Monitor connection state
        pc.onconnectionstatechange = () => {
          setConnectionState(pc.connectionState);
          console.log('[PublicListeningParty] Connection state:', pc.connectionState);
        };

        pc.oniceconnectionstatechange = () => {
          setIceState(pc.iceConnectionState);
          console.log('[PublicListeningParty] ICE state:', pc.iceConnectionState);
        };

        // Listen for signals from creator
        signalChannel = supabase
          .channel(`signals-${me.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'listening_party_signals',
              filter: `to_participant_id=eq.${me.id}`,
            },
            async (payload) => {
              const msg: any = payload.new;
              setSignalsReceived((prev) => prev + 1);
              setLastSignalType(msg.type);

              console.log('[PublicListeningParty] Received signal:', msg.type);

              if (msg.type === 'offer') {
                console.log('[PublicListeningParty] Processing offer');
                try {
                  await pc.setRemoteDescription(msg.payload);
                  const answer = await pc.createAnswer();
                  await pc.setLocalDescription(answer);

                  // Send answer back to creator
                  await supabase.from('listening_party_signals').insert({
                    party_id: party.id,
                    from_participant_id: me.id,
                    to_participant_id: msg.from_participant_id,
                    type: 'answer',
                    payload: answer,
                  });

                  console.log('[PublicListeningParty] Sent answer');
                } catch (err) {
                  console.error('[PublicListeningParty] Offer handling error:', err);
                }
              }

              if (msg.type === 'ice') {
                try {
                  await pc.addIceCandidate(msg.payload);
                  console.log('[PublicListeningParty] Added ICE candidate');
                } catch (err) {
                  console.error('[PublicListeningParty] ICE add error:', err);
                }
              }
            }
          )
          .subscribe();

        console.log('[PublicListeningParty] Subscribed to signals');

        // Subscribe to participant count
        const participantChannel = supabase
          .channel(`participants-${party.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'listening_party_participants',
              filter: `party_id=eq.${party.id}`,
            },
            async () => {
              const { count } = await supabase
                .from('listening_party_participants')
                .select('*', { count: 'exact', head: true })
                .eq('party_id', party.id);

              if (count !== null) setViewerCount(count);
            }
          )
          .subscribe();

        // Get initial count
        const { count } = await supabase
          .from('listening_party_participants')
          .select('*', { count: 'exact', head: true })
          .eq('party_id', party.id);

        if (count !== null) setViewerCount(count);
      } catch (e: any) {
        console.error('[PublicListeningParty] Setup error:', e);
        if (mounted) setError(e.message || 'Failed to setup connection');
      }
    })();

    return () => {
      mounted = false;
      if (signalChannel) supabase.removeChannel(signalChannel);
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [party]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-black flex items-center justify-center">
        <div className="text-white">Loading party...</div>
      </div>
    );
  }

  if (error === 'not-found') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-black flex items-center justify-center">
        <div className="text-center text-white max-w-md px-4">
          <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-800">
            <Lock className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Party Not Available</h2>
          <p className="text-gray-400 mb-6">
            This party is private or doesn't exist. Ask the host to toggle Public or go live.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-black flex items-center justify-center">
        <div className="text-center text-white max-w-md px-4">
          <h2 className="text-2xl font-bold mb-4">Error Loading Party</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show waiting state for draft parties
  if (party && (party.status === 'draft' || (!party.is_live && party.status !== 'ended' && party.status !== 'archived'))) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-black flex items-center justify-center">
        <div className="text-center text-white max-w-md px-4">
          <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/20">
            <Clock className="w-8 h-8 text-blue-400 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold mb-4">{party.title}</h2>
          <p className="text-gray-400 mb-2">Waiting for host to go live...</p>
          {party.host_display_name && (
            <p className="text-gray-500 text-sm mb-6">
              Hosted by {party.host_display_name}
            </p>
          )}
          <div className="flex items-center justify-center gap-2 text-gray-400">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            <span className="text-sm">Party is public but not live yet</span>
          </div>
        </div>
      </div>
    );
  }

  // Show ended state
  if (party && (party.status === 'ended' || party.status === 'archived')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-black flex items-center justify-center">
        <div className="text-center text-white max-w-md px-4">
          <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-800">
            <Music className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold mb-4">{party.title}</h2>
          <p className="text-gray-400 mb-2">This party has ended</p>
          {party.host_display_name && (
            <p className="text-gray-500 text-sm mb-6">
              Hosted by {party.host_display_name}
            </p>
          )}
          <p className="text-gray-500 text-sm">
            Thanks for joining! Check with the host for future parties.
          </p>
        </div>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-black flex items-center justify-center">
        <div className="text-white">Loading party...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-black text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold">{party.title}</h1>
            <div className="flex items-center gap-4">
              {party.is_live ? (
                <div className="flex items-center gap-2 bg-red-500 px-3 py-1 rounded-full">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  <span className="text-sm font-semibold">LIVE</span>
                </div>
              ) : (
                <div className="bg-gray-700 px-3 py-1 rounded-full text-sm">
                  Not Live
                </div>
              )}
              <div className="flex items-center gap-2 bg-gray-800 px-3 py-1 rounded-full">
                <Users className="w-4 h-4" />
                <span className="text-sm">{viewerCount}</span>
              </div>
            </div>
          </div>
          {party.host_display_name && (
            <p className="text-gray-400">Hosted by {party.host_display_name}</p>
          )}
        </div>

        {/* Video Player */}
        <div className="mb-8">
          <div className="bg-black rounded-lg overflow-hidden aspect-video">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
          </div>
          {party.current_track_title && (
            <div className="mt-4 flex items-center gap-2 text-gray-300">
              <Music className="w-5 h-5" />
              <span>{party.current_track_title}</span>
            </div>
          )}
        </div>

        {/* Debug Panel */}
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Signal className="w-5 h-5" />
            Connection Debug
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">My Participant ID:</span>
              <p className="font-mono text-xs text-gray-300 break-all">
                {myParticipant?.id || 'Not joined'}
              </p>
            </div>
            <div>
              <span className="text-gray-400">Creator ID:</span>
              <p className="font-mono text-xs text-gray-300 break-all">
                {creatorParticipant?.id || 'Not found'}
              </p>
            </div>
            <div>
              <span className="text-gray-400">Signals Received:</span>
              <p className="font-semibold">{signalsReceived}</p>
            </div>
            <div>
              <span className="text-gray-400">Last Signal:</span>
              <p className="font-semibold">{lastSignalType}</p>
            </div>
            <div>
              <span className="text-gray-400">Connection State:</span>
              <div className="flex items-center gap-2">
                {connectionState === 'connected' ? (
                  <Wifi className="w-4 h-4 text-green-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500" />
                )}
                <p className="font-semibold">{connectionState}</p>
              </div>
            </div>
            <div>
              <span className="text-gray-400">ICE State:</span>
              <p className="font-semibold">{iceState}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
