import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { StreamVideo, StreamVideoClient, StreamCall, StreamTheme, LivestreamPlayer } from '@stream-io/video-react-sdk';
import '@stream-io/video-react-sdk/dist/css/styles.css';
import { Send, Users, Circle, Music } from 'lucide-react';
import { parseSpotifyUrl, isSpotifyUrl } from '../utils/spotify';
import { isUuid } from '../lib/isUuid';

type Party = {
  id: string;
  title: string;
  host_display_name?: string;
  status: string;
  stream_app_id?: string;
  created_at: string;
  is_live?: boolean;
  live_started_at?: string;
  current_track_url?: string;
  current_track_title?: string;
};

type ChatMessage = {
  id: string;
  username: string;
  message: string;
  created_at: string;
};

export default function PublicListeningParty() {
  const { slug } = useParams<{ slug: string }>();
  const [party, setParty] = useState<Party | null>(null);
  const [loadingParty, setLoadingParty] = useState(true);
  const [partyError, setPartyError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [usernameSet, setUsernameSet] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);

  const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<any>(null);
  const [joiningVideo, setJoiningVideo] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Parse Spotify URL for Add to Spotify button
  const spotify = useMemo(() => parseSpotifyUrl(party?.current_track_url), [party?.current_track_url]);

  // Load username from localStorage
  useEffect(() => {
    const stored = window.localStorage.getItem('ghoste_listening_username');
    if (stored) {
      setUsername(stored);
      setUsernameSet(true);
    }
  }, []);

  // Fetch party details by public slug + realtime updates
  useEffect(() => {
    if (!slug) return;

    let isMounted = true;
    let channel: any;
    let timeoutId: NodeJS.Timeout;

    // Hard timeout guard (15 seconds)
    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Loading party timed out after 15 seconds. Please refresh the page.'));
      }, 15000);
    });

    (async () => {
      try {
        setLoadingParty(true);
        setPartyError(null);

        const routeParam = slug?.trim();
        if (!routeParam) {
          setPartyError('Invalid party link.');
          setLoadingParty(false);
          return;
        }

        console.log('[PublicListeningParty] Fetching party with param:', routeParam, 'isUuid:', isUuid(routeParam));

        let data = null;
        let error = null;

        // 1) If UUID, allow direct lookup by id (still must be public)
        if (isUuid(routeParam)) {
          const result = await supabase
            .from('listening_parties')
            .select('*')
            .eq('is_public', true)
            .eq('id', routeParam)
            .maybeSingle();

          data = result.data;
          error = result.error;

          if (data) {
            console.log('[PublicListeningParty] Found by UUID id:', data);
          }
        }

        // 2) If not found yet, try public_slug
        if (!data && !error) {
          const result = await supabase
            .from('listening_parties')
            .select('*')
            .eq('is_public', true)
            .eq('public_slug', routeParam)
            .maybeSingle();

          data = result.data;
          error = result.error;

          if (data) {
            console.log('[PublicListeningParty] Found by public_slug:', data);
          }
        }

        // 3) Fallback to legacy slug column
        if (!data && !error) {
          const result = await supabase
            .from('listening_parties')
            .select('*')
            .eq('is_public', true)
            .eq('slug', routeParam)
            .maybeSingle();

          data = result.data;
          error = result.error;

          if (data) {
            console.log('[PublicListeningParty] Found by legacy slug:', data);
          }
        }

        if (!isMounted) return;

        console.log('[PublicListeningParty] Query results:', { found: !!data, error: error?.message, is_public: data?.is_public, is_live: data?.is_live, status: data?.status });

        // Clear timeout if we got here successfully
        clearTimeout(timeoutId);

        if (!isMounted) return;

        if (error) {
          console.error('[PublicListeningParty] Database error:', error);
          setPartyError(`Database error: ${error.message} (${error.code || 'unknown'}). Please try refreshing the page.`);
        } else if (!data) {
          console.warn('[PublicListeningParty] No party found for param:', routeParam);
          setPartyError(
            'Party not found. The party may not be public yet, or the link may be incorrect. ' +
            'Ask the host to click "Go Live" to make it public.'
          );
        } else {
          console.log('[PublicListeningParty] Party loaded successfully:', {
            id: data.id,
            title: data.title,
            is_public: data.is_public,
            is_live: data.is_live,
            status: data.status
          });
          setParty(data as Party);

          // Subscribe to realtime updates for live status and track changes
          channel = supabase
            .channel(`listening_party_public_${data.id}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'listening_parties',
                filter: `id=eq.${data.id}`
              },
              (payload) => {
                if (isMounted) {
                  const updated = payload.new as any;
                  console.log('[PublicListeningParty] Realtime update received:', {
                    is_live: updated.is_live,
                    status: updated.status
                  });
                  setParty((prev) => (prev ? { ...prev, ...updated } : updated));
                }
              }
            )
            .subscribe();
        }
      } catch (e: any) {
        clearTimeout(timeoutId);
        if (!isMounted) return;
        console.error('[PublicListeningParty] Unexpected error:', e);
        setPartyError(e?.message || 'Something went wrong loading the party. Please refresh the page.');
      } finally {
        clearTimeout(timeoutId);
        if (isMounted) setLoadingParty(false);
      }
    })();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (channel) supabase.removeChannel(channel);
    };
  }, [slug]);

  // Fetch initial chat messages and subscribe to new ones
  useEffect(() => {
    if (!party) return;

    let isMounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('listening_party_chat_messages')
        .select('*')
        .eq('party_id', party.id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (!isMounted) return;
      if (!error && data) {
        setMessages(data as ChatMessage[]);
      }
    })();

    // Subscribe to realtime chat messages
    const channel = supabase
      .channel(`party-chat-${party.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'listening_party_chat_messages',
          filter: `party_id=eq.${party.id}`,
        },
        (payload) => {
          if (isMounted) {
            setMessages((prev) => [...prev, payload.new as ChatMessage]);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [party]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Join video stream as viewer
  useEffect(() => {
    if (!party || !usernameSet) return;

    const joinVideoStream = async () => {
      try {
        setJoiningVideo(true);

        // ✅ Guard: Check if party is actually live
        if (!party.is_live) {
          console.log('[PublicListeningParty] Party not live yet, waiting...');
          setJoiningVideo(false);
          return;
        }

        // ✅ Guard: Check for invalid stream_url (Spotify URLs that shouldn't be there)
        if (party.stream_app_id && typeof party.stream_app_id === 'string') {
          if (party.stream_app_id.includes('spotify.com') || party.stream_app_id.includes('open.spotify')) {
            console.error('[PublicListeningParty] INVALID: stream_app_id contains Spotify URL:', party.stream_app_id);
            setPartyError('Stream setup error. Please ask the host to restart the stream.');
            setJoiningVideo(false);
            return;
          }
        }

        // ✅ Guard: If party is live but stream_app_id is null, show setup message
        if (!party.stream_app_id) {
          console.log('[PublicListeningParty] Party is live but stream not ready yet');
          setPartyError('Host is setting up the live stream… refresh in a moment.');
          setJoiningVideo(false);
          return;
        }

        // ✅ Get auth session for server-side join
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session;

        if (!session) {
          console.error('[PublicListeningParty] No auth session - cannot join');
          throw new Error('Please log in to join this listening party');
        }

        console.log('[PublicListeningParty] Joining party via server function...');

        // ✅ Call new join function that upserts Stream users server-side
        const res = await fetch('/.netlify/functions/listening-party-join', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            public_slug: party.public_slug || slug,
            userName: username || 'Guest',
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to join party');
        }

        console.log('[PublicListeningParty] Join successful:', data);

        // ✅ Use returned chat credentials (users are already created on Stream)
        const { chat } = data;

        const apiKey = chat.apiKey;

        console.log('[LP Viewer] Setting up watch-only mode for livestream:', {
          partyId: party.id,
          callType: 'livestream',
          isLive: party.is_live
        });

        // ✅ WATCH-ONLY MODE: Create video client but DO NOT join call
        // Viewers watch the livestream playback, they don't become participants
        const vc = new StreamVideoClient({
          apiKey,
          token: chat.token,
          user: { id: chat.userId, name: chat.userName },
        });

        // Get call reference (DO NOT JOIN)
        // LivestreamPlayer component handles playback without joining
        const videoCall = vc.call('livestream', party.id);

        setVideoClient(vc);
        setCall(videoCall);

        console.log('[LP Viewer] Watch mode ready - no join required');
      } catch (err: any) {
        console.error('[PublicListeningParty] Failed to join video stream:', err);
        setPartyError(err?.message || 'Failed to join video stream');
      } finally {
        setJoiningVideo(false);
      }
    };

    joinVideoStream();

    return () => {
      // Viewers don't join calls, so no need to leave
      // Just disconnect the video client
      if (videoClient) {
        videoClient.disconnectUser().catch(console.error);
      }
    };
  }, [party, username, usernameSet, slug]);

  async function handleSetUsername() {
    if (!username.trim()) return;
    window.localStorage.setItem('ghoste_listening_username', username.trim());
    setUsername(username.trim());
    setUsernameSet(true);
  }

  async function handleSendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!party || !usernameSet || !messageInput.trim()) return;

    try {
      setSending(true);
      const { error } = await supabase.from('listening_party_chat_messages').insert({
        party_id: party.id,
        username,
        message: messageInput.trim(),
      });

      if (error) throw error;
      setMessageInput('');
    } catch (err) {
      console.error('Failed to send chat message', err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-50">
      {/* Header */}
      <header className="border-b border-slate-800/70 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-bold text-white">
              G
            </div>
            <span className="text-sm font-semibold tracking-tight text-slate-100">
              Ghoste One
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:flex-row">
        {/* Left: Live Stream Player */}
        <section className="flex-1 space-y-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 shadow-2xl">
            {loadingParty ? (
              <div className="h-96 animate-pulse rounded-2xl bg-slate-900/70" />
            ) : partyError ? (
              <div className="flex h-96 flex-col items-center justify-center gap-3 text-center">
                <div className="text-sm text-slate-400">{partyError}</div>
              </div>
            ) : (
              <>
                {/* Party Info Header */}
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl font-bold text-slate-50">
                        {party?.title || 'Listening Party'}
                      </h1>
                      <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
                        party?.is_live
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-slate-800/50 text-slate-500'
                      }`}>
                        <Circle className={`h-2 w-2 ${party?.is_live ? 'fill-red-500 animate-pulse' : 'fill-slate-600'}`} />
                        {party?.is_live ? 'Live' : 'Offline'}
                      </div>
                    </div>
                    {party?.host_display_name && (
                      <p className="mt-1 text-sm text-slate-400">
                        Hosted by {party.host_display_name}
                      </p>
                    )}
                    {party?.is_live && party?.live_started_at && (
                      <p className="mt-1 text-xs text-slate-500">
                        Started {new Date(party.live_started_at).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {viewerCount > 0 && (
                    <div className="flex items-center gap-1.5 rounded-full bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300">
                      <Users className="h-3.5 w-3.5" />
                      {viewerCount}
                    </div>
                  )}
                </div>

                {/* Current Track Info */}
                {(party?.current_track_url || party?.current_track_title) && (
                  <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Music className="h-3.5 w-3.5" />
                          Now Playing
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-200">
                          {party.current_track_title || 'Track'}
                        </div>
                        {party.current_track_url && (
                          <div className="mt-1 text-xs text-slate-600 break-all">
                            {party.current_track_url}
                          </div>
                        )}
                      </div>
                      {party.current_track_url && (spotify.openUrl || isSpotifyUrl(party.current_track_url)) && (
                        <a
                          href={spotify.openUrl || party.current_track_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700/50 transition-colors"
                        >
                          Add to Spotify
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Video Player - Watch Only (Twitch-style) */}
                <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                  {joiningVideo ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-sm text-slate-400">Connecting to stream...</div>
                    </div>
                  ) : call && videoClient ? (
                    party?.is_live ? (
                      <StreamVideo client={videoClient}>
                        <StreamCall call={call}>
                          <StreamTheme>
                            <LivestreamPlayer />
                          </StreamTheme>
                        </StreamCall>
                      </StreamVideo>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                        <Circle className="h-8 w-8 fill-slate-700 text-slate-700" />
                        <div>
                          <div className="text-sm font-semibold text-slate-300">Stream Offline</div>
                          <div className="mt-1 text-xs text-slate-500">
                            Waiting for host to go live...
                          </div>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">
                      Loading stream...
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Right: Live Chat */}
        <aside className="flex w-full flex-col rounded-3xl border border-slate-800 bg-slate-950/80 shadow-2xl lg:w-96">
          <div className="flex items-center justify-between border-b border-slate-800/70 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Live Chat
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Circle className="h-2 w-2 fill-green-500" />
              {messages.length} messages
            </div>
          </div>

          {!usernameSet && (
            <div className="m-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Choose a username
              </p>
              <p className="mb-3 text-xs text-slate-500">
                Pick a name so other fans know who you are.
              </p>
              <div className="flex gap-2">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSetUsername()}
                  placeholder="Your name"
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none placeholder:text-slate-600 focus:border-blue-500"
                  maxLength={50}
                />
                <button
                  onClick={handleSetUsername}
                  disabled={!username.trim()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Join
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center py-12 text-center text-xs text-slate-500">
                No messages yet. Be the first to say hi! 👋
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl bg-slate-900/50 px-3 py-2 transition-colors hover:bg-slate-900"
                >
                  <div className="text-xs font-semibold text-blue-400">{m.username}</div>
                  <div className="mt-0.5 text-sm text-slate-200">{m.message}</div>
                  <div className="mt-1 text-[10px] text-slate-600">
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <form onSubmit={handleSendMessage} className="border-t border-slate-800/70 p-4">
            <div className="flex gap-2">
              <input
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder={usernameSet ? 'Send a message...' : 'Choose a username first'}
                disabled={!usernameSet || sending}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none placeholder:text-slate-600 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                maxLength={500}
              />
              <button
                type="submit"
                disabled={!usernameSet || sending || !messageInput.trim()}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </aside>
      </main>
    </div>
  );
}
