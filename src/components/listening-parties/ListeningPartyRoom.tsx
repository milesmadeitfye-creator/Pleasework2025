import React, { useEffect, useState } from "react";
import {
  Chat,
  Channel,
  ChannelHeader,
  MessageInput,
  MessageList,
  Window,
  LoadingIndicator,
} from "stream-chat-react";
import { StreamChat } from "stream-chat";
import "stream-chat-react/dist/css/v2/index.css";

import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  StreamTheme,
  SpeakerLayout,
  CallControls,
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";

import { requestCameraAndMic } from "../../utils/mediaDevices";

type ListeningPartyRoomProps = {
  apiKey: string;
  token: string;
  userId: string;
  userName: string;
  partyId: string;
  title: string;
  trackUrl: string | null;
  role: "host" | "listener";
  onLeave?: () => void;
};

const ListeningPartyRoom: React.FC<ListeningPartyRoomProps> = ({
  apiKey,
  token,
  userId,
  userName,
  partyId,
  title,
  trackUrl,
  role,
  onLeave,
}) => {
  const [chatClient, setChatClient] = useState<StreamChat | null>(null);
  const [channel, setChannel] = useState<any>(null);
  const [isChatReady, setIsChatReady] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [connectionDiagnostics, setConnectionDiagnostics] = useState<any>(null);

  const [copied, setCopied] = useState(false);

  const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(
    null
  );
  const [call, setCall] = useState<any>(null);
  const [isJoiningVideo, setIsJoiningVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [enableCamera, setEnableCamera] = useState(false);
  const [enableMic, setEnableMic] = useState(true);
  const [showPreJoin, setShowPreJoin] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    // Validate credentials before attempting connection
    if (!apiKey) {
      const diagnostics = {
        hasApiKey: false,
        hasToken: !!token,
        hasUserId: !!userId,
        hasUserName: !!userName,
        error: "Stream API key missing. Token service did not provide apiKey.",
      };
      setConnectionDiagnostics(diagnostics);
      setChatError("Stream API key missing. Token service did not provide apiKey.");
      console.error("[ListeningPartyRoom] Missing API key:", diagnostics);
      return;
    }

    if (!token) {
      const diagnostics = {
        hasApiKey: true,
        hasToken: false,
        hasUserId: !!userId,
        hasUserName: !!userName,
        error: "User token is missing",
      };
      setConnectionDiagnostics(diagnostics);
      setChatError("User token is missing. Please refresh and try again.");
      console.error("[ListeningPartyRoom] Missing token:", diagnostics);
      return;
    }

    if (!userId) {
      const diagnostics = {
        hasApiKey: true,
        hasToken: true,
        hasUserId: false,
        hasUserName: !!userName,
        error: "User ID is missing",
      };
      setConnectionDiagnostics(diagnostics);
      setChatError("User ID is missing. Please refresh and try again.");
      console.error("[ListeningPartyRoom] Missing userId:", diagnostics);
      return;
    }

    let mounted = true;
    const sc = StreamChat.getInstance(apiKey);

    console.log("[ListeningPartyRoom] Attempting to connect to Stream Chat:", {
      userId,
      userName,
      hasApiKey: true,
      hasToken: true,
      tokenLength: token.length,
    });

    sc.connectUser(
      {
        id: userId,
        name: userName,
      },
      token
    )
      .then(() => {
        if (!mounted) return;

        console.log("[ListeningPartyRoom] Successfully connected to Stream Chat");

        const ch = sc.channel("livestream", partyId);
        setChannel(ch);
        setChatClient(sc);
        setIsChatReady(true);
        setChatError(null);
        setConnectionDiagnostics({
          hasApiKey: true,
          hasToken: true,
          hasUserId: true,
          hasUserName: true,
          connected: true,
        });
      })
      .catch((err) => {
        if (!mounted) return;

        console.error("[ListeningPartyRoom] Failed to connect to Stream Chat:", err);

        const diagnostics = {
          hasApiKey: true,
          hasToken: true,
          hasUserId: true,
          hasUserName: true,
          connected: false,
          error: err?.message || "Unknown error",
          errorCode: err?.code,
          statusCode: err?.statusCode,
        };
        setConnectionDiagnostics(diagnostics);
        setChatError(
          `Failed to connect to chat: ${err?.message || "Unknown error"}. Please refresh and try again.`
        );
      });

    return () => {
      mounted = false;
      sc.disconnectUser().catch(() => {});
    };
  }, [apiKey, token, userId, userName, partyId]);

  useEffect(() => {
    // Generate public shareable URL
    const url = `${window.location.origin}/live/${partyId}`;
    setShareUrl(url);
  }, [partyId]);

  const handleJoinVideo = async () => {
    setShowPreJoin(true);
    setVideoError(null);
  };

  const handleConfirmJoinVideo = async () => {
    setIsJoiningVideo(true);
    setVideoError(null);
    setShowPreJoin(false);

    try {
      const mediaResult = await requestCameraAndMic({
        video: enableCamera,
        audio: enableMic,
      });

      if (!mediaResult.ok) {
        console.error('[ListeningPartyRoom] Media access failed:', mediaResult);
        setVideoError(mediaResult.message);
        setIsJoiningVideo(false);
        return;
      }

      const stream = mediaResult.stream;
      console.log('[ListeningPartyRoom] Media stream obtained successfully');

      if (!apiKey) {
        setVideoError('Stream API key missing. Token service did not provide apiKey.');
        setIsJoiningVideo(false);
        return;
      }

      const vc = new StreamVideoClient({ apiKey, token, user: { id: userId, name: userName } });

      console.log('[ListeningPartyRoom] Attempting to join video call...');
      const videoCall = vc.call("default", partyId);

      try {
        await videoCall.join({ create: true });
        console.log('[ListeningPartyRoom] Successfully joined video call');
      } catch (joinErr: any) {
        console.error('[ListeningPartyRoom] call.join failed:', joinErr);

        // Check if it's an SFU WebSocket connection error
        const errorMsg = joinErr?.message?.toLowerCase() || '';
        const isSfuError =
          errorMsg.includes('sfu') ||
          errorMsg.includes('websocket') ||
          errorMsg.includes('connection') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('failed to open');

        if (isSfuError) {
          setVideoError(
            'Live connection blocked (WebSocket/SFU). This may be a Content Security Policy or network issue. Please check your browser console for details or contact support.'
          );
        } else {
          setVideoError(
            `Failed to join video call: ${joinErr?.message || 'Unknown error'}. Please try again.`
          );
        }

        setIsJoiningVideo(false);

        // Clean up video client
        try {
          await vc.disconnectUser();
        } catch {}

        return;
      }

      setVideoClient(vc);
      setCall(videoCall);
      setIsJoiningVideo(false);
    } catch (err: any) {
      console.error('[ListeningPartyRoom] Error in video setup:', err);
      setVideoError(
        'Could not set up video connection. Please check your camera/mic permissions and try again.'
      );
      setIsJoiningVideo(false);
    }
  };

  const handleEndVideo = async () => {
    try {
      if (call) {
        await call.leave();
      }
      if (videoClient) {
        await videoClient.disconnectUser();
      }
    } catch (err) {
      console.error("Error leaving video call:", err);
    } finally {
      setCall(null);
      setVideoClient(null);
    }
  };

  if (!chatClient || !channel || !isChatReady) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <LoadingIndicator />
        <p className="mt-3 text-xs text-gray-400">
          Connecting you to the listening party…
        </p>

        {/* Connection Error Diagnostics */}
        {chatError && (
          <div className="mt-6 max-w-md w-full bg-red-950/40 border border-red-800/60 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-300">Stream Chat Connection Failed</h3>
                <p className="mt-1 text-xs text-red-400">{chatError}</p>
              </div>
            </div>

            {/* Diagnostics */}
            {connectionDiagnostics && (
              <div className="mt-3 pt-3 border-t border-red-800/30">
                <p className="text-xs font-medium text-red-300 mb-2">Diagnostics:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        connectionDiagnostics.hasApiKey ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <span className="text-gray-400">API Key</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        connectionDiagnostics.hasToken ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <span className="text-gray-400">User Token</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        connectionDiagnostics.hasUserId ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <span className="text-gray-400">User ID</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        connectionDiagnostics.hasUserName ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <span className="text-gray-400">User Name</span>
                  </div>
                </div>
                {connectionDiagnostics.error && (
                  <div className="mt-2 p-2 bg-black/30 rounded text-xs text-gray-400 font-mono break-words">
                    Error: {connectionDiagnostics.error}
                    {connectionDiagnostics.errorCode && ` (Code: ${connectionDiagnostics.errorCode})`}
                    {connectionDiagnostics.statusCode && ` (Status: ${connectionDiagnostics.statusCode})`}
                  </div>
                )}
              </div>
            )}

            {/* Retry Button */}
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 rounded-lg text-xs bg-red-600 text-white hover:bg-red-500 font-medium transition"
            >
              Refresh Page
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">
              {title || "Listening Party"}
            </h2>
            <p className="mt-1 text-[11px] text-emerald-400/90">
              {role === "host"
                ? "You're live. Share your listening party link:"
                : "You're tuned in as a listener."}
            </p>
          </div>
          {onLeave && (
            <button
              type="button"
              onClick={onLeave}
              className="px-3 py-1.5 rounded-lg text-xs bg-red-600 text-white hover:bg-red-500"
            >
              Leave party
            </button>
          )}
        </div>

        {role === "host" && shareUrl && (
          <div className="mt-2 rounded-2xl border border-slate-700 bg-slate-900/60 p-4 flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                Listening Party Link
              </span>
              <span className="text-sm text-slate-50 truncate">
                {shareUrl}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  .writeText(shareUrl)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                  .catch((err) => {
                    console.error("Failed to copy link:", err);
                  });
              }}
              className="px-4 py-2 rounded-lg text-xs bg-blue-600 text-white hover:bg-blue-500 whitespace-nowrap"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,2.1fr)_minmax(0,1.3fr)]">
        <div className="space-y-4">
          <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-5">
            <h3 className="text-sm font-medium text-gray-200">Now playing</h3>
            {trackUrl ? (
              <div className="mt-2 bg-black/70 border border-white/10 rounded-xl p-3">
                <audio src={trackUrl} controls className="w-full" />
                <p className="mt-2 text-[11px] text-gray-400">
                  This audio is played locally for each user. Later we can add
                  true host-synced playback.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500">
                No track URL attached yet. The host can set one when starting a
                party.
              </p>
            )}
          </div>

          <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-gray-200">
                  Live video
                </h3>
                <p className="text-[11px] text-gray-400">
                  Turn on your camera & mic to host, or join the live session.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!call ? (
                  <button
                    type="button"
                    onClick={handleJoinVideo}
                    disabled={isJoiningVideo}
                    className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isJoiningVideo
                      ? "Connecting…"
                      : role === "host"
                      ? "Go Live with Video"
                      : "Join Live Video"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleEndVideo}
                    className="px-3 py-1.5 rounded-lg text-xs bg-red-600 text-white hover:bg-red-500"
                  >
                    Leave Video
                  </button>
                )}
              </div>
            </div>

            {videoError && (
              <div className="mb-3 text-[11px] text-red-400 bg-red-950/40 border border-red-800/60 rounded-lg px-3 py-2">
                {videoError}
              </div>
            )}

            {/* Pre-join modal for device permissions */}
            {showPreJoin && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                <div className="bg-neutral-900 border border-white/20 rounded-2xl p-6 max-w-md w-full space-y-4">
                  <h3 className="text-lg font-semibold text-white">
                    Choose your settings
                  </h3>
                  <p className="text-sm text-gray-400">
                    Configure your camera and microphone before joining the live session.
                  </p>

                  <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 rounded-lg bg-black/40 border border-white/10 cursor-pointer hover:border-blue-500/50 transition">
                      <input
                        type="checkbox"
                        checked={enableCamera}
                        onChange={(e) => setEnableCamera(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Enable Camera</div>
                        <div className="text-xs text-gray-400">Share your video with others</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 rounded-lg bg-black/40 border border-white/10 cursor-pointer hover:border-blue-500/50 transition">
                      <input
                        type="checkbox"
                        checked={enableMic}
                        onChange={(e) => setEnableMic(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Enable Microphone</div>
                        <div className="text-xs text-gray-400">Share your audio with others</div>
                      </div>
                    </label>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowPreJoin(false)}
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm bg-white/10 hover:bg-white/20 text-white font-medium transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmJoinVideo}
                      disabled={isJoiningVideo}
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white font-semibold transition disabled:opacity-50"
                    >
                      {isJoiningVideo ? "Joining..." : "Join Listening Party"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {videoClient && call ? (
              <div className="border border-white/10 rounded-xl overflow-hidden bg-black/80">
                <StreamVideo client={videoClient}>
                  <StreamTheme>
                    <StreamCall call={call}>
                      <div className="aspect-video">
                        <SpeakerLayout />
                      </div>
                      <div className="border-t border-white/10">
                        <CallControls />
                      </div>
                    </StreamCall>
                  </StreamTheme>
                </StreamVideo>
              </div>
            ) : (
              <div className="h-40 border border-dashed border-white/15 rounded-xl flex items-center justify-center text-[11px] text-gray-500">
                {isJoiningVideo
                  ? "Connecting to Stream Video…"
                  : role === "host"
                  ? 'Click "Go Live with Video" to start broadcasting to your fans.'
                  : 'When the host goes live, click "Join Live Video" to watch.'}
              </div>
            )}
          </div>
        </div>

        <div className="bg-neutral-900/80 border border-white/10 rounded-2xl overflow-hidden flex flex-col">
          <Chat client={chatClient}>
            <Channel channel={channel}>
              <Window>
                <ChannelHeader live />
                <MessageList />
                <MessageInput
                  focus
                />
              </Window>
            </Channel>
          </Chat>
        </div>
      </div>
    </div>
  );
};

export default ListeningPartyRoom;
