import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import ListeningPartyRoom from "./listening-parties/ListeningPartyRoom";
import { Copy, Check, Music, Users } from "lucide-react";
import { chargeCredits, InsufficientCreditsError, getWallet } from '../lib/credits';
import InsufficientCreditsModal from './ui/InsufficientCreditsModal';

type PartyState = {
  appId: string;
  apiKey: string;
  partyId: string;
  title: string;
  trackUrl: string | null;
  userId: string;
  userName: string;
  role: "host" | "listener";
  token: string;
};

const ListeningParties: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");
  const [trackUrl, setTrackUrl] = useState("");
  const [joinPartyId, setJoinPartyId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [party, setParty] = useState<PartyState | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [insufficientModal, setInsufficientModal] = useState<{
    open: boolean;
    cost: number;
    remaining: number;
    featureKey: string;
    plan: string;
  }>({
    open: false,
    cost: 0,
    remaining: 0,
    featureKey: '',
    plan: 'operator',
  });

  // Auto-detect party ID from URL
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const partyIdFromUrl = searchParams.get("party");
    if (partyIdFromUrl) {
      setJoinPartyId(partyIdFromUrl);
    }
  }, []);

  // Prefill display name from user profile
  useEffect(() => {
    if (user && !userName) {
      supabase
        .from("user_profiles")
        .select("artist_name, email")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.artist_name) {
            setUserName(data.artist_name);
          } else if (user.email) {
            setUserName(user.email.split("@")[0]);
          }
        });
    }
  }, [user, userName]);

  const ensureUserIds = () => {
    const trimmedName = userName.trim();
    if (!trimmedName) {
      setError("Add a display name first so fans know who you are.");
      return false;
    }
    if (!userId.trim()) {
      const id = trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
      setUserId(id || "guest-" + Math.random().toString(36).slice(2, 8));
    }
    return true;
  };

  const withTimeout = <T,>(promise: Promise<T>, ms: number = 12000): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Create timed out. Try again.")), ms);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  };

  const handleCreateParty = async () => {
    if (isLoading) return; // Prevent double submit
    setError(null);
    if (!ensureUserIds()) return;

    const effectiveUserId =
      userId.trim() ||
      userName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "") ||
      "host-" + Math.random().toString(36).slice(2, 8);

    if (!title.trim()) {
      setError("Give your listening party a title.");
      return;
    }

    // Charge credits FIRST using the new credit economy system
    try {
      await chargeCredits('listening_party_create', {
        title: title.trim(),
        trackUrl: trackUrl.trim() || null,
        userName: userName.trim(),
      });
    } catch (error: any) {
      if (error instanceof InsufficientCreditsError) {
        const wallet = await getWallet(user?.id);
        setInsufficientModal({
          open: true,
          cost: error.cost,
          remaining: error.remaining,
          featureKey: error.feature_key,
          plan: wallet?.plan || 'operator',
        });
        return;
      }
      setError(error.message || 'Failed to charge credits');
      return;
    }

    setIsLoading(true);
    try {
      // ✅ Get auth token for backend
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // ✅ Include auth token so function can set owner_user_id
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const fetchPromise = fetch("/.netlify/functions/stream-listening-party", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create",
          title: title.trim(),
          trackUrl: trackUrl.trim() || null,
          userId: effectiveUserId,
          userName: userName.trim(),
        }),
      });

      const res = await withTimeout(fetchPromise, 12000);
      const data = await res.json().catch(() => ({} as any));

      if (!res.ok || data.error || !data.ok) {
        throw new Error(data.error || "Could not create party.");
      }

      // ✅ Function now returns real UUID + public_slug directly
      if (!data.id && !data.partyId) {
        throw new Error("Server returned incomplete party data (missing id).");
      }

      if (!data.public_slug) {
        throw new Error("Server returned incomplete party data (missing public_slug).");
      }

      const partyId = data.id || data.partyId;  // Accept either field name
      const publicSlug = data.public_slug;

      console.log('[ListeningParties] Party created:', {
        id: partyId,
        public_slug: publicSlug,
        is_public: data.is_public
      });

      // ✅ Navigate HOST to the private host page (NOT public /live page)
      console.log('[ListeningParties] Navigating HOST to /studio/listening-parties/host/' + partyId);
      navigate(`/studio/listening-parties/host/${partyId}`);
    } catch (err: any) {
      console.error("[ListeningParties] Create party error:", err);
      const errorMessage = err?.message || "Something went wrong creating the party.";
      setError(errorMessage);
    } finally {
      setIsLoading(false); // GUARANTEED STOP
    }
  };

  const handleJoinParty = async () => {
    if (isLoading) return; // Prevent double submit
    setError(null);
    if (!ensureUserIds()) return;

    const effectiveUserId =
      userId.trim() ||
      userName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "") ||
      "guest-" + Math.random().toString(36).slice(2, 8);

    if (!joinPartyId.trim()) {
      setError("Paste a party ID to join.");
      return;
    }

    setIsLoading(true);
    try {
      const fetchPromise = fetch("/.netlify/functions/stream-listening-party", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "join",
          partyId: joinPartyId.trim(),
          userId: effectiveUserId,
          userName: userName.trim(),
        }),
      });

      const res = await withTimeout(fetchPromise, 12000);
      const data = await res.json().catch(() => ({} as any));

      if (!res.ok || data.error) {
        throw new Error(data.error || "Could not join that party.");
      }

      if (!data.partyId || !data.token) {
        throw new Error("Server returned incomplete party data.");
      }

      setParty({
        appId: data.appId,
        apiKey: data.apiKey,
        partyId: data.partyId,
        title: data.title,
        trackUrl: data.trackUrl,
        userId: data.userId,
        userName: data.userName,
        role: data.role,
        token: data.token,
      });
    } catch (err: any) {
      console.error("[ListeningParties] Join party error:", err);
      const errorMessage = err?.message || "Something went wrong joining the party.";
      setError(errorMessage);
    } finally {
      setIsLoading(false); // GUARANTEED STOP
    }
  };

  const handleLeave = () => {
    setParty(null);
    setShareUrl("");
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  // Dev helper: create test party
  const handleCreateTestParty = async () => {
    if (isLoading) return;
    setError(null);

    const testUserName = user?.email?.split("@")[0] || "Test Host";
    const testTitle = `Test Party ${Date.now()}`;
    const testTrackUrl = "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp";

    setUserName(testUserName);
    setTitle(testTitle);
    setTrackUrl(testTrackUrl);
    setUserId(testUserName.toLowerCase().replace(/[^a-z0-9]+/g, "-"));

    setIsLoading(true);
    try {
      const effectiveUserId = testUserName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      const fetchPromise = fetch("/.netlify/functions/stream-listening-party", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create",
          title: testTitle,
          trackUrl: testTrackUrl,
          userId: effectiveUserId,
          userName: testUserName,
        }),
      });

      const res = await withTimeout(fetchPromise, 12000);
      const data = await res.json().catch(() => ({} as any));

      if (!res.ok || data.error || !data.ok) {
        throw new Error(data.error || "Could not create test party.");
      }

      // ✅ Function now returns real UUID + public_slug directly
      if (!data.id && !data.partyId) {
        throw new Error("Server returned incomplete party data (missing id).");
      }

      if (!data.public_slug) {
        throw new Error("Server returned incomplete party data (missing public_slug).");
      }

      const partyId = data.id || data.partyId;  // Accept either field name
      const publicSlug = data.public_slug;

      console.log('[Dev] Test party created:', {
        id: partyId,
        public_slug: publicSlug,
        is_public: data.is_public
      });

      // ✅ Navigate HOST to the private host page (NOT public /live page)
      console.log('[Dev] Navigating HOST to /studio/listening-parties/host/' + partyId);
      navigate(`/studio/listening-parties/host/${partyId}`);
    } catch (err: any) {
      console.error("[Dev] Create test party error:", err);
      const errorMessage = err?.message || "Failed to create test party.";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Determine current step for UI
  const currentStep = !userName.trim() ? 1 : !trackUrl.trim() ? 2 : 3;

  // If party is active, show the room
  if (party) {
    return (
      <ListeningPartyRoom
        apiKey={party.apiKey}
        token={party.token}
        userId={party.userId}
        userName={party.userName}
        partyId={party.partyId}
        title={party.title}
        trackUrl={party.trackUrl}
        role={party.role}
        onLeave={handleLeave}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0A0E1A] to-[#1a1f2e] py-12 px-4">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold text-white">
            Listening Parties
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Host live listening sessions with fans. Share a Spotify track, chat in real time,
            and vibe together.
          </p>
          {/* Dev Debug Helper - only show if logged in */}
          {user && (
            <div className="pt-4">
              <button
                onClick={handleCreateTestParty}
                disabled={isLoading}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isLoading ? "Creating..." : "Create Test Party (Dev)"}
              </button>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="max-w-2xl mx-auto bg-red-950/40 border border-red-800/60 rounded-xl p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* LEFT: Host Card */}
          <div className="bg-[#151b2e]/80 backdrop-blur-sm border border-blue-500/20 rounded-2xl p-6 space-y-6 shadow-[0_0_30px_rgba(43,110,242,0.15)]">
            {/* Step Indicators */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition ${
                    currentStep >= 1
                      ? "bg-blue-500 text-white"
                      : "bg-gray-700 text-gray-400"
                  }`}
                >
                  1
                </div>
                <span
                  className={`text-sm font-medium ${
                    currentStep >= 1 ? "text-white" : "text-gray-500"
                  }`}
                >
                  Host
                </span>
              </div>

              <div className="h-px flex-1 mx-2 bg-gray-700" />

              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition ${
                    currentStep >= 2
                      ? "bg-blue-500 text-white"
                      : "bg-gray-700 text-gray-400"
                  }`}
                >
                  2
                </div>
                <span
                  className={`text-sm font-medium ${
                    currentStep >= 2 ? "text-white" : "text-gray-500"
                  }`}
                >
                  Track
                </span>
              </div>

              <div className="h-px flex-1 mx-2 bg-gray-700" />

              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition ${
                    currentStep >= 3
                      ? "bg-blue-500 text-white"
                      : "bg-gray-700 text-gray-400"
                  }`}
                >
                  3
                </div>
                <span
                  className={`text-sm font-medium ${
                    currentStep >= 3 ? "text-white" : "text-gray-500"
                  }`}
                >
                  Go Live
                </span>
              </div>
            </div>

            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Music className="w-5 h-5 text-blue-400" />
              Host a Listening Party
            </h2>

            {/* Step 1: Display Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                Your display name
              </label>
              <input
                type="text"
                className="w-full rounded-lg bg-black/50 border border-white/20 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="e.g. DJ Shadow, Tatiany, Ghoste..."
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                This is how fans will see you in the chat
              </p>
            </div>

            {/* Step 2: Party Title */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                Party title
              </label>
              <input
                type="text"
                className="w-full rounded-lg bg-black/50 border border-white/20 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="e.g. New Single First Listen, Album Preview..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Step 3: Spotify Track URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                Spotify track URL
              </label>
              <input
                type="text"
                className="w-full rounded-lg bg-black/50 border border-white/20 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="https://open.spotify.com/track/..."
                value={trackUrl}
                onChange={(e) => setTrackUrl(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Paste a Spotify track link. Fans can play it during the party.
              </p>
            </div>

            {/* Create Button */}
            <button
              type="button"
              onClick={handleCreateParty}
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-blue-500/30"
            >
              {isLoading ? "Creating party..." : "Create & Go Live"}
            </button>

            {/* Share URL (shown after party created) */}
            {shareUrl && (
              <div className="space-y-3 pt-4 border-t border-white/10">
                <p className="text-sm font-medium text-gray-300">
                  Share this link with your fans:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 rounded-lg bg-black/50 border border-white/20 px-4 py-2 text-sm text-gray-300 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Send this link to your fans. Anyone with the link can join.
                </p>
              </div>
            )}
          </div>

          {/* RIGHT: Join / Info Card */}
          <div className="bg-[#151b2e]/80 backdrop-blur-sm border border-blue-500/20 rounded-2xl p-6 space-y-6 shadow-[0_0_30px_rgba(43,110,242,0.15)]">
            {joinPartyId ? (
              <>
                {/* Auto-join flow when ?party= detected */}
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-400" />
                  Join Listening Party
                </h2>

                <div className="space-y-4">
                  <div className="bg-black/30 border border-white/10 rounded-lg p-4 space-y-2">
                    <p className="text-sm text-gray-400">Party ID:</p>
                    <p className="text-white font-mono text-sm break-all">
                      {joinPartyId}
                    </p>
                  </div>

                  {trackUrl && (
                    <div className="bg-black/30 border border-white/10 rounded-lg p-4 space-y-2">
                      <p className="text-sm text-gray-400">Track:</p>
                      <p className="text-white text-sm truncate">{trackUrl}</p>
                    </div>
                  )}

                  {/* Display Name Input */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">
                      Your display name
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg bg-black/50 border border-white/20 px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      placeholder="Enter your name..."
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                    />
                  </div>

                  {/* Join Button */}
                  <button
                    type="button"
                    onClick={handleJoinParty}
                    disabled={isLoading}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-semibold hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-emerald-500/30"
                  >
                    {isLoading ? "Joining..." : "Join Party"}
                  </button>

                  {/* Open in Spotify */}
                  {trackUrl && trackUrl.includes("spotify") && (
                    <button
                      type="button"
                      onClick={() =>
                        window.open(trackUrl, "_blank", "noopener,noreferrer")
                      }
                      className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition"
                    >
                      <Music className="w-4 h-4" />
                      Open in Spotify
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Info card when no party detected */}
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-400" />
                  How Listening Parties Work
                </h2>

                <div className="space-y-4 text-gray-300">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-semibold text-sm">
                      1
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">Host</h3>
                      <p className="text-sm text-gray-400">
                        Create a party and share your link with fans
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-semibold text-sm">
                      2
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">Fans</h3>
                      <p className="text-sm text-gray-400">
                        Tap the link to join instantly and chat in real time
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-semibold text-sm">
                      3
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">Everyone</h3>
                      <p className="text-sm text-gray-400">
                        Play the track on Spotify while vibing together in chat
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <p className="text-sm text-gray-400 text-center">
                    Get started by creating a party on the left, or ask your host for
                    their party link.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Insufficient Credits Modal */}
      <InsufficientCreditsModal
        isOpen={insufficientModal.open}
        onClose={() => setInsufficientModal({ ...insufficientModal, open: false })}
        cost={insufficientModal.cost}
        remaining={insufficientModal.remaining}
        featureKey={insufficientModal.featureKey}
        plan={insufficientModal.plan}
      />
    </div>
  );
};

export default ListeningParties;
