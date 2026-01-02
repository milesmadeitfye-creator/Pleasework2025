import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { RefreshCw, TrendingUp, Users, Search, Music } from 'lucide-react';
import { AnalyticsKpiCard } from '../components/analytics/AnalyticsKpiCard';
import { AnalyticsPanel } from '../components/analytics/AnalyticsPanel';
import SmartLinkClicksPanel from '../components/analytics/SmartLinkClicksPanel';
import OneClickAnalyticsPanel from '../components/analytics/OneClickAnalyticsPanel';
import { fetchSmartlinkClickSummary, fetchSmartlinkClicksByDay } from '../lib/analytics/smartlinkClicks';
import { useSmartlinkAnalytics } from '../hooks/useSmartlinkAnalytics';
import { AudienceDemographicsCard } from '../components/analytics/AudienceDemographicsCard';
import { LinkClickDemographicsCard } from '../components/analytics/LinkClickDemographicsCard';
import { TrafficSourcesCard } from '../components/analytics/TrafficSourcesCard';
import { TopPerformingAssetsCard } from '../components/analytics/TopPerformingAssetsCard';
import { SpotifyArtistIdentity } from '../components/analytics/SpotifyArtistIdentity';

interface Stats {
  totalLinks: number;
  totalClicks: number;
  totalPreSaves: number;
  totalContacts: number;
  totalCampaigns: number;
  totalAdSpend: number;
  totalImpressions: number;
  totalSocialPosts: number;
}

interface StreamingData {
  platform: string;
  streams: number;
  followers: number;
  monthly_listeners: number;
  date: string;
  growth_rate?: number;
}

interface DailyStats {
  date: string;
  streams: number;
  followers?: number;
  monthly_listeners?: number;
}

interface ClickSeries {
  date: string;
  label: string;
  clicks: number;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalLinks: 0,
    totalClicks: 0,
    totalPreSaves: 0,
    totalContacts: 0,
    totalCampaigns: 0,
    totalAdSpend: 0,
    totalImpressions: 0,
    totalSocialPosts: 0,
  });
  const [streamingData, setStreamingData] = useState<StreamingData[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [clickSeries, setClickSeries] = useState<ClickSeries[]>([]);
  const [spotifyStats, setSpotifyStats] = useState<{
    followers: number | null;
    popularity: number | null;
    artistName: string | null;
  } | null>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [linksTab, setLinksTab] = useState<'smart' | 'oneclick'>('smart');

  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Array<{
    spotify_artist_id: string;
    name: string;
    image: string | null;
    followers: number | null;
    popularity: number | null;
    genres: string[];
  }>>([]);

  const [selectedCandidate, setSelectedCandidate] = useState<{
    spotify_artist_id: string;
    name: string;
    image: string | null;
    followers: number | null;
    popularity: number | null;
    genres: string[];
  } | null>(null);

  const [activeArtist, setActiveArtist] = useState<{
    spotify_artist_id: string;
    name: string;
    image: string | null;
    followers: number | null;
    popularity: number | null;
    genres: string[];
  } | null>(null);

  const [isPickerOpen, setIsPickerOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [enrichLoading, setEnrichLoading] = useState(false);

  // Analytics hook for the 4 new cards
  // ✅ Stable date range (does NOT change each render)
  const [analyticsDateRange] = useState(() => ({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: new Date(),
  }));

  const analyticsData = useSmartlinkAnalytics({
    userId: user?.id,
    dateRange: analyticsDateRange,
  });
  const [core, setCore] = useState<{ spotifyMonthlyListeners: number | null; spotifyStreams: number | null } | null>(null);
  const [platformSignals, setPlatformSignals] = useState<any>(null);
  const [sources, setSources] = useState<any>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "ready" | "error">("idle");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [nextCheckAt, setNextCheckAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Debug mode for analytics troubleshooting
  const [searchParamsState] = useState(() => new URLSearchParams(window.location.search));
  const isDebugMode = searchParamsState.get('debug') === '1';
  const [debugData, setDebugData] = useState<{
    totalClicksInDb: number | null;
    lastTenClicks: any[];
    queryError: string | null;
  }>({ totalClicksInDb: null, lastTenClicks: [], queryError: null });

  const isAdmin = useMemo(() => {
    return !!userEmail && ["test@ghostemedia.com", "milesdorre5@gmail.com"].includes(userEmail);
  }, [userEmail]);

  useEffect(() => {
    if (user) {
      fetchAllData();
      supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
    }
  }, [user]);

  // Refresh stats when activeArtist changes (after save)
  useEffect(() => {
    if (!activeArtist) return;
    // Keep it lightweight: don't force refresh every render
    enrichArtist(activeArtist, false);
  }, [activeArtist?.spotify_artist_id]);

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetchStats(),
      fetchStreamingData(),
      fetchDailyStats(),
      fetchClickSeries(),
      fetchSpotifyStats(),
      ...(isDebugMode ? [fetchDebugData()] : []),
    ]);
    setLoading(false);
  };

  const fetchDebugData = async () => {
    if (!user) return;

    try {
      // Count total events
      const { count: totalCount, error: countError } = await supabase
        .from('smartlink_events')
        .select('*', { count: 'exact', head: true })
        .eq('owner_user_id', user.id);

      // Fetch last 10 events using analytics module
      const recentClicks = await fetchSmartlinkRecentClicks(user.id, undefined, 10);

      if (countError) {
        setDebugData({
          totalClicksInDb: null,
          lastTenClicks: [],
          queryError: countError?.message || 'Unknown error',
        });
      } else {
        setDebugData({
          totalClicksInDb: totalCount || 0,
          lastTenClicks: recentClicks || [],
          queryError: null,
        });
      }
    } catch (error: any) {
      console.error('[Analytics Debug] Error fetching debug data:', error);
      setDebugData({
        totalClicksInDb: null,
        lastTenClicks: [],
        queryError: error?.message || 'Unexpected error',
      });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  };

  const fetchStats = async () => {
    if (!user) return;

    try {
      const now = new Date();
      const last30Days = new Date(now);
      last30Days.setDate(last30Days.getDate() - 30);

      // Fetch links
      const { count: linksCount } = await supabase
        .from('oneclick_links')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Fetch link clicks using analytics module
      const clickSummary = await fetchSmartlinkClickSummary(
        user.id,
        last30Days.toISOString()
      );

      // Fetch contacts
      const { count: contactsCount } = await supabase
        .from('fan_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Fetch campaigns
      const { count: campaignsCount } = await supabase
        .from('meta_ad_campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Fetch social posts
      const { count: postsCount } = await supabase
        .from('social_posts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setStats({
        totalLinks: linksCount || 0,
        totalClicks: clickSummary.totalClicks,
        totalPreSaves: 0,
        totalContacts: contactsCount || 0,
        totalCampaigns: campaignsCount || 0,
        totalAdSpend: 0,
        totalImpressions: 0,
        totalSocialPosts: postsCount || 0,
      });
    } catch (error) {
      console.error('[Analytics] Error fetching stats:', error);
    }
  };

  const fetchStreamingData = async () => {
    if (!user) return;
    setStreamingData([]);
  };

  const fetchDailyStats = async () => {
    if (!user) return;
    setDailyStats([]);
  };

  const fetchClickSeries = async () => {
    if (!user) return;

    try {
      const now = new Date();
      const last30Days = new Date(now);
      last30Days.setDate(last30Days.getDate() - 30);

      const clicksByDay = await fetchSmartlinkClicksByDay(
        user.id,
        last30Days.toISOString()
      );

      const series = clicksByDay.map((item) => ({
        date: item.day,
        label: new Date(item.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        clicks: item.clicks,
      }));

      setClickSeries(series);
    } catch (error) {
      console.error('[Analytics] Error fetching click series:', error);
      setClickSeries([]);
    }
  };

  const fetchSpotifyStats = async () => {
    if (!user) return;

    try {
      const { data: artistStats } = await supabase
        .from('spotify_artist_stats')
        .select('*')
        .eq('user_id', user.id)
        .order('last_synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (artistStats) {
        const stats = {
          followers: artistStats.followers || null,
          popularity: artistStats.popularity || null,
          artistName: artistStats.artist_name || null,
        };

        // ✅ DEBUG LOG: Spotify stats loaded
        console.log('[Analytics][Spotify]', {
          artistName: stats.artistName,
          followers: stats.followers,
          popularity: stats.popularity,
        });

        setSpotifyStats(stats);
      }
    } catch (error) {
      console.error('Error fetching Spotify stats:', error);
    }
  };

  const runSearch = async () => {
    if (!q.trim()) return;
    setSearching(true);
    setResults([]);
    setSelectedCandidate(null);
    setErr(null);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const res = await fetch("/.netlify/functions/analytics-artist-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ q }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Search failed");
      setResults(json.items || []);
    } catch (e: any) {
      setErr(e?.message || "Search error");
    } finally {
      setSearching(false);
    }
  };

  const selectCandidate = async (artist: typeof selectedCandidate) => {
    if (!artist) return;
    setSelectedCandidate(artist);
    // Preload stats immediately so cards update right away
    await enrichArtist(artist, false);
  };

  const enrichArtist = async (artist: typeof selectedCandidate, force: boolean) => {
    if (!artist) return;
    setEnrichLoading(true);

    // Clear previous stats on new selection (unless force refresh)
    if (!force) {
      setCore(null);
      setPlatformSignals(null);
      setSources(null);
      setStatus("idle");
    }

    setErr(null);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const res = await fetch("/.netlify/functions/analytics-artist-enrich", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ spotifyArtistId: artist.spotify_artist_id, force }),
      });

      const json = await res.json();

      // ✅ DEBUG LOG: Analytics enrichment (Spotify + Songstats combined)
      console.log('[Analytics][Spotify+Songstats]', {
        status: json.status,
        hasCore: !!json.core,
        hasPlatformSignals: !!json.platformSignals,
        sources: json.sources,
        spotifyArtistId: artist.spotify_artist_id,
      });

      setStatus(json.status || "ready");

      if (json.status === "pending") {
        setPendingMessage(json.message || "Songstats is indexing this artist. Check back later.");
        setNextCheckAt(json.nextCheckAt || null);
        setCore(null);
        setPlatformSignals(null);
        setSources(json.sources || null);
        return;
      }

      if (json.status === "error") {
        setErr(json.message || "Songstats error");
        return;
      }

      setPendingMessage(null);
      setNextCheckAt(null);
      setCore(json.core || null);
      setPlatformSignals(json.platformSignals || null);
      setSources(json.sources || null);
    } catch (e: any) {
      setStatus("error");
      setErr(e?.message || "Enrich error");
    } finally {
      setEnrichLoading(false);
    }
  };

  const saveCandidate = async () => {
    if (!selectedCandidate) return;
    setIsSaving(true);
    setErr(null);

    try {
      // ✅ Close the search immediately for a snappy UX
      setIsPickerOpen(false);

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const res = await fetch("/.netlify/functions/analytics-save-artist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          spotifyArtistId: selectedCandidate.spotify_artist_id,
          artistName: selectedCandidate.name,
          artistImage: selectedCandidate.image,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Save failed");

      // ✅ Commit the active artist (this is what the cards should reflect)
      setActiveArtist(selectedCandidate);

      // ✅ Clear results so it doesn't reopen with stale list
      setResults([]);

      // ✅ Force-refresh stats/cards/charts from this selection
      await enrichArtist(selectedCandidate, true);
    } catch (e: any) {
      // If save fails, reopen search so user isn't stuck
      setIsPickerOpen(true);
      console.error("Save artist error:", e);
      setErr(e?.message || "Failed to save artist");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshStats = async () => {
    if (!activeArtist) return;
    await enrichArtist(activeArtist, true);
  };

  const totalStreams = streamingData.reduce((acc, data) => acc + data.streams, 0);
  const totalFollowers = streamingData.reduce((acc, data) => acc + data.followers, 0);
  const totalMonthlyListeners = streamingData.reduce(
    (acc, data) => acc + data.monthly_listeners,
    0
  );

  const maxClicks = Math.max(...clickSeries.map((s) => s.clicks), 1);
  const maxFollowers = Math.max(...dailyStats.map((s) => s.followers || 0), 1);
  const maxMonthlyListeners = Math.max(...dailyStats.map((s) => s.monthly_listeners || 0), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ghoste-blue"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Artist Identity Block */}
      <SpotifyArtistIdentity
        onIdentityChange={(identity) => {
          // When identity is linked, use songstats_artist_id for analytics queries
          if (identity?.songstats_artist_id) {
            console.log('[Analytics] Artist identity linked:', identity);
          }
        }}
      />

      {/* Analytics Search Header - MOVED TO TOP */}
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-ghoste-blue" />
            <h2 className="text-lg font-bold text-ghoste-white">Analytics Search</h2>
          </div>
          {activeArtist && (
            <button
              onClick={handleRefreshStats}
              disabled={enrichLoading || status === "pending"}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-ghoste-black/80 px-4 py-2 text-xs font-medium text-ghoste-grey hover:bg-ghoste-blue hover:text-ghoste-white hover:shadow-[0_0_18px_rgba(26,108,255,0.6)] transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${enrichLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Stats</span>
            </button>
          )}
        </div>

        <p className="text-xs text-ghoste-grey mb-4">
          Spotify discovery + Songstats signals (cached 24h, force refresh available)
        </p>

        {/* Pinned Artist (if saved) */}
        {activeArtist && !isPickerOpen && (
          <div className="mb-4 rounded-2xl border border-green-500/20 bg-green-500/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {activeArtist.image ? (
                  <img src={activeArtist.image} className="h-12 w-12 rounded-xl object-cover" alt={activeArtist.name} />
                ) : (
                  <div className="h-12 w-12 rounded-xl bg-white/10" />
                )}
                <div>
                  <div className="text-white font-semibold">{activeArtist.name}</div>
                  <div className="text-xs text-white/60">Saved Artist</div>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsPickerOpen(true);
                  setQ(activeArtist.name);
                  setSelectedCandidate(activeArtist);
                }}
                className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs font-medium text-white hover:bg-black/60 transition"
              >
                Change
              </button>
            </div>
          </div>
        )}

        {/* Search Input */}
        {isPickerOpen && (
          <>
            <div className="flex flex-col gap-3 md:flex-row md:items-center mb-4">
              <input
                className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-white"
                placeholder="Search an artist name..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !selectedCandidate) runSearch();
                }}
              />
              <button
                onClick={() => (selectedCandidate ? saveCandidate() : runSearch())}
                disabled={searching || isSaving || (!selectedCandidate && !q.trim())}
                className={
                  "rounded-2xl px-6 py-2 font-semibold transition " +
                  (selectedCandidate
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-white/10 text-white/80 hover:bg-white/20")
                }
              >
                {selectedCandidate
                  ? (isSaving ? "Saving..." : "Save")
                  : (searching ? "Searching..." : "Search")}
              </button>
            </div>

            {/* Search Results */}
            {results.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {results.map((a) => {
                  const isActive = selectedCandidate?.spotify_artist_id === a.spotify_artist_id;
                  return (
                    <button
                      key={a.spotify_artist_id}
                      onClick={() => selectCandidate(a)}
                      className={
                        "text-left rounded-2xl border p-3 transition " +
                        (isActive
                          ? "border-blue-400/70 bg-blue-500/15"
                          : "border-white/10 bg-black/40 hover:bg-black/50")
                      }
                    >
                      <div className="flex items-center gap-3">
                        {a.image ? (
                          <img src={a.image} className="h-12 w-12 rounded-xl object-cover" alt={a.name} />
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-white/10" />
                        )}
                        <div className="flex-1">
                          <div className="text-white font-semibold">{a.name}</div>
                          <div className="text-xs text-white/60">
                            Followers: {a.followers?.toLocaleString?.() ?? "—"} • Popularity: {a.popularity ?? "—"}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Selected/Active Artist Preview & Stats */}
        {(selectedCandidate || activeArtist) && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-center gap-3">
              {(selectedCandidate || activeArtist)!.image ? (
                <img src={(selectedCandidate || activeArtist)!.image!} className="h-14 w-14 rounded-2xl object-cover" alt={(selectedCandidate || activeArtist)!.name} />
              ) : (
                <div className="h-14 w-14 rounded-2xl bg-white/10" />
              )}
              <div className="flex-1">
                <div className="text-white text-xl font-semibold">{(selectedCandidate || activeArtist)!.name}</div>
                <div className="text-xs text-white/60">Spotify ID: {(selectedCandidate || activeArtist)!.spotify_artist_id}</div>
              </div>
              <div className="text-xs text-white/60">
                {enrichLoading ? "Loading..." : status === "pending" ? "Indexing..." : status === "ready" ? "Ready" : status === "error" ? "Error" : "—"}
              </div>
            </div>

            {/* Pending State */}
            {status === "pending" && (
              <div className="mt-4 rounded-2xl border border-yellow-200/20 bg-yellow-200/10 p-4">
                <div className="text-sm font-semibold text-yellow-100">Indexing artist in Songstats...</div>
                <div className="mt-1 text-sm text-yellow-100/80">{pendingMessage}</div>
                {nextCheckAt && (
                  <div className="mt-2 text-xs text-yellow-100/70">
                    Suggested next check: {new Date(nextCheckAt).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Ready State - Core Stats Cards */}
            {status === "ready" && (
              <>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                    <div className="text-xs text-white/60">Spotify Monthly Listeners</div>
                    <div className="text-2xl text-white font-bold">
                      {core?.spotifyMonthlyListeners != null ? core.spotifyMonthlyListeners.toLocaleString() : "—"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                    <div className="text-xs text-white/60">Spotify Streams</div>
                    <div className="text-2xl text-white font-bold">
                      {core?.spotifyStreams != null ? core.spotifyStreams.toLocaleString() : "—"}
                    </div>
                  </div>

                  {platformSignals?.spotify?.followers != null && (
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                      <div className="text-xs text-white/60">Spotify Followers</div>
                      <div className="text-2xl text-white font-bold">
                        {platformSignals.spotify.followers.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Platform Signals */}
                {platformSignals && (
                  <div className="mt-4">
                    <div className="text-sm text-white/80 font-medium mb-3">Platform Signals</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {/* YouTube */}
                      {platformSignals.youtube?.subscribers != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">YouTube Subs</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.youtube.subscribers.toLocaleString()}
                          </div>
                        </div>
                      )}
                      {platformSignals.youtube?.views != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">YouTube Views</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.youtube.views.toLocaleString()}
                          </div>
                        </div>
                      )}

                      {/* Apple Music */}
                      {platformSignals.apple_music?.followers != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">Apple Followers</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.apple_music.followers.toLocaleString()}
                          </div>
                        </div>
                      )}
                      {platformSignals.apple_music?.plays != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">Apple Plays</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.apple_music.plays.toLocaleString()}
                          </div>
                        </div>
                      )}

                      {/* TikTok */}
                      {platformSignals.tiktok?.followers != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">TikTok Followers</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.tiktok.followers.toLocaleString()}
                          </div>
                        </div>
                      )}
                      {platformSignals.tiktok?.views != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">TikTok Views</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.tiktok.views.toLocaleString()}
                          </div>
                        </div>
                      )}
                      {platformSignals.tiktok?.likes != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">TikTok Likes</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.tiktok.likes.toLocaleString()}
                          </div>
                        </div>
                      )}

                      {/* Instagram */}
                      {platformSignals.instagram?.followers != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">IG Followers</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.instagram.followers.toLocaleString()}
                          </div>
                        </div>
                      )}

                      {/* Shazam */}
                      {platformSignals.shazam?.shazams != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">Shazams</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.shazam.shazams.toLocaleString()}
                          </div>
                        </div>
                      )}

                      {/* SoundCloud */}
                      {platformSignals.soundcloud?.followers != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">SoundCloud Followers</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.soundcloud.followers.toLocaleString()}
                          </div>
                        </div>
                      )}
                      {platformSignals.soundcloud?.plays != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">SoundCloud Plays</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.soundcloud.plays.toLocaleString()}
                          </div>
                        </div>
                      )}

                      {/* Deezer */}
                      {platformSignals.deezer?.followers != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">Deezer Followers</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.deezer.followers.toLocaleString()}
                          </div>
                        </div>
                      )}

                      {/* Amazon */}
                      {platformSignals.amazon?.plays != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">Amazon Plays</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.amazon.plays.toLocaleString()}
                          </div>
                        </div>
                      )}

                      {/* TIDAL */}
                      {platformSignals.tidal?.plays != null && (
                        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
                          <div className="text-[10px] text-white/50 uppercase tracking-wide">TIDAL Plays</div>
                          <div className="text-lg text-white font-semibold mt-1">
                            {platformSignals.tidal.plays.toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Raw Sources Data Collapsible */}
            {status === "ready" && sources && (
              <details className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4">
                <summary className="cursor-pointer text-sm text-white/80">View raw sources data</summary>
                <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl bg-black/50 p-3 text-xs text-white/80">
                  {JSON.stringify(sources, null, 2)}
                </pre>
              </details>
            )}

            {/* Error State */}
            {status === "error" && err && (
              <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
                {err}
              </div>
            )}
          </div>
        )}

        {err && !(selectedCandidate || activeArtist) && <div className="text-sm text-red-300 mt-2">{err}</div>}
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-wide text-ghoste-white">Analytics</h1>
          <p className="mt-1 max-w-xl text-xs text-ghoste-grey">
            Deep dive into how your music, links, campaigns, and fans are performing across Ghoste One.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-ghoste-black/80 px-4 py-2 text-xs font-medium text-ghoste-grey hover:bg-ghoste-blue hover:text-ghoste-white hover:shadow-[0_0_18px_rgba(26,108,255,0.6)] transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Section 1: Main KPI Cards */}
      <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        <AnalyticsKpiCard
          label="Monthly Listeners"
          value={totalMonthlyListeners || 0}
          meta="Spotify"
        />
        <AnalyticsKpiCard
          label="Spotify Followers"
          value={spotifyStats?.followers || totalFollowers || 0}
          meta="All-time"
        />
        <AnalyticsKpiCard
          label="Popularity Score"
          value={spotifyStats?.popularity || 0}
          meta="/100"
        />
        <AnalyticsKpiCard
          label="Smart Link Clicks"
          value={stats.totalClicks}
          meta="All links"
        />
        <AnalyticsKpiCard
          label="Email Subscribers"
          value={stats.totalContacts}
          meta="Active"
        />
      </section>

      {/* Section 2: Growth & Spotify Overview */}
      <section className="grid gap-4 lg:grid-cols-2">
        <AnalyticsPanel title="Listener & Follower Growth">
          {dailyStats.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ghoste-grey">Last 30 days</span>
                <span className="text-ghoste-white font-medium">
                  {totalMonthlyListeners.toLocaleString()} listeners
                </span>
              </div>
              <div>
                <p className="text-[10px] text-ghoste-grey mb-1">Monthly Listeners</p>
                <div className="h-24 flex items-end gap-1">
                  {dailyStats.slice(-30).map((stat, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-ghoste-blue/20 hover:bg-ghoste-blue/40 rounded-t transition-all relative group"
                      style={{
                        height: `${((stat.monthly_listeners || 0) / maxMonthlyListeners) * 100}%`,
                        minHeight: '4px',
                      }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-ghoste-black/95 border border-white/10 rounded px-2 py-1 text-[10px] whitespace-nowrap z-10">
                        {new Date(stat.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {(stat.monthly_listeners || 0).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <p className="text-[10px] text-ghoste-grey mb-1">Followers</p>
                <div className="h-24 flex items-end gap-1">
                  {dailyStats.slice(-30).map((stat, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-green-500/20 hover:bg-green-500/40 rounded-t transition-all relative group"
                      style={{
                        height: `${((stat.followers || 0) / maxFollowers) * 100}%`,
                        minHeight: '4px',
                      }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-ghoste-black/95 border border-white/10 rounded px-2 py-1 text-[10px] whitespace-nowrap z-10">
                        {new Date(stat.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {(stat.followers || 0).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-ghoste-grey/60">
              Growth data will appear here once your Spotify integration is active.
            </div>
          )}
        </AnalyticsPanel>

        <AnalyticsPanel title="Top Spotify Metrics">
          {spotifyStats ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20">
                <Music className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-[11px] text-green-300 uppercase tracking-wider">Artist</p>
                  <p className="text-sm font-bold text-ghoste-white truncate">{spotifyStats.artistName || 'Unknown'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-ghoste-blue" />
                    <span className="text-[10px] uppercase tracking-wider text-ghoste-grey">Followers</span>
                  </div>
                  <p className="text-lg font-bold text-ghoste-white">{(spotifyStats.followers || 0).toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-ghoste-blue" />
                    <span className="text-[10px] uppercase tracking-wider text-ghoste-grey">Popularity</span>
                  </div>
                  <p className="text-lg font-bold text-ghoste-white">{spotifyStats.popularity || 0}/100</p>
                </div>
              </div>
              <div className="text-[11px] text-ghoste-grey space-y-1">
                <p><span className="text-ghoste-white">Top Markets:</span> Coming soon</p>
                <p><span className="text-ghoste-white">Top Playlists:</span> Coming soon</p>
                <p><span className="text-ghoste-white">Top Track:</span> Coming soon</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-ghoste-grey/60">
              Connect your Spotify account to see detailed metrics.
            </div>
          )}
        </AnalyticsPanel>
      </section>

      {/* Section 3: Link Clicks Over Time */}
      <section>
        <AnalyticsPanel title="Smart Link Clicks Over Time">
          {clickSeries.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ghoste-grey">Last 30 days</span>
                <span className="text-ghoste-white font-medium">
                  {stats.totalClicks.toLocaleString()} total clicks
                </span>
              </div>
              <div className="h-40 flex items-end gap-1">
                {clickSeries.map((stat, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-ghoste-blue/20 hover:bg-ghoste-blue/40 rounded-t transition-all relative group"
                    style={{
                      height: `${(stat.clicks / maxClicks) * 100}%`,
                      minHeight: '4px',
                    }}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-ghoste-black/95 border border-white/10 rounded px-2 py-1 text-[10px] whitespace-nowrap z-10">
                      {stat.label}: {stat.clicks} clicks
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-ghoste-grey/60">
              No click data available. Create smart links to start tracking.
            </div>
          )}
        </AnalyticsPanel>
      </section>


      {/* Section 4: Demographics */}
      <section className="grid gap-4 lg:grid-cols-2">
        <AudienceDemographicsCard
          data={{
            deviceSplit: analyticsData.deviceSplit,
            browserSplit: analyticsData.browserSplit,
            peakHour: analyticsData.peakHour,
            loading: analyticsData.loading,
            error: analyticsData.error,
          }}
        />

        <LinkClickDemographicsCard
          data={{
            topCountries: analyticsData.topCountries,
            topCities: analyticsData.topCities,
            osSplit: analyticsData.osSplit,
            newVsReturning: analyticsData.newVsReturning,
            loading: analyticsData.loading,
            error: analyticsData.error,
          }}
        />
      </section>

      {/* Section 5: Acquisition & Assets */}
      <section className="grid gap-4 lg:grid-cols-2">
        <TrafficSourcesCard
          data={{
            referrerCategories: analyticsData.referrerCategories,
            utmSources: analyticsData.utmSources,
            utmCampaigns: analyticsData.utmCampaigns,
            loading: analyticsData.loading,
            error: analyticsData.error,
          }}
        />

        <TopPerformingAssetsCard
          data={{
            topLinks: analyticsData.topLinks,
            topPlatforms: analyticsData.topPlatforms,
            mostActiveDay: analyticsData.mostActiveDay,
            loading: analyticsData.loading,
            error: analyticsData.error,
          }}
        />
      </section>

      {/* Links Analytics - Smart Links + One-Click */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b border-gray-800">
          <button
            onClick={() => setLinksTab('smart')}
            className={`px-6 py-3 text-sm font-semibold transition-colors relative ${
              linksTab === 'smart'
                ? 'text-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Smart Links
            {linksTab === 'smart' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400"></div>
            )}
          </button>
          <button
            onClick={() => setLinksTab('oneclick')}
            className={`px-6 py-3 text-sm font-semibold transition-colors relative ${
              linksTab === 'oneclick'
                ? 'text-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            One-Click Links
            {linksTab === 'oneclick' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400"></div>
            )}
          </button>
        </div>

        {linksTab === 'smart' && <SmartLinkClicksPanel />}
        {linksTab === 'oneclick' && <OneClickAnalyticsPanel />}
      </section>

      {/* Section 6: Future Metrics (styled placeholders) */}
      <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-3">
        <AnalyticsKpiCard
          label="Projected Revenue"
          value="Coming Soon"
          meta="Estimated earnings"
          muted
        />
        <AnalyticsKpiCard
          label="Fan Lifetime Value"
          value="Coming Soon"
          meta="Average per fan"
          muted
        />
        <AnalyticsKpiCard
          label="Virality Index"
          value="Coming Soon"
          meta="Growth score"
          muted
        />
      </section>

      {/* Debug Panel (only visible with ?debug=1) */}
      {isDebugMode && (
        <section className="rounded-3xl border border-yellow-500/30 bg-yellow-500/10 backdrop-blur-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
              <h2 className="text-lg font-bold text-yellow-200">
                Debug Mode: Link Click Tracking
              </h2>
            </div>
            <button
              onClick={() => fetchDebugData()}
              className="inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/20 px-4 py-2 text-xs font-medium text-yellow-100 hover:bg-yellow-500/30 transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh Debug Data</span>
            </button>
          </div>

          <div className="space-y-4">
            {/* Query Status */}
            <div className="rounded-xl bg-black/40 border border-yellow-500/20 p-4">
              <h3 className="text-sm font-semibold text-yellow-100 mb-3">Query Status</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-yellow-200/70">Table:</span>
                  <span className="text-yellow-100 font-mono">smartlink_events</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-200/70">Filter Column:</span>
                  <span className="text-yellow-100 font-mono">user_id</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-200/70">Your User ID:</span>
                  <span className="text-yellow-100 font-mono text-[10px]">{user?.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-200/70">Total Clicks in DB:</span>
                  <span className="text-yellow-100 font-semibold">
                    {debugData.totalClicksInDb !== null ? debugData.totalClicksInDb : '—'}
                  </span>
                </div>
                {debugData.queryError && (
                  <div className="mt-2 p-2 rounded bg-red-500/20 border border-red-500/30 text-red-200 text-xs">
                    Error: {debugData.queryError}
                  </div>
                )}
              </div>
            </div>

            {/* Last 10 Events */}
            <div className="rounded-xl bg-black/40 border border-yellow-500/20 p-4">
              <h3 className="text-sm font-semibold text-yellow-100 mb-3">
                Last 10 Events (owner_user_id = your ID)
              </h3>
              {debugData.lastTenClicks.length > 0 ? (
                <div className="space-y-2">
                  {debugData.lastTenClicks.map((click, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg bg-black/30 border border-yellow-500/10 p-3 text-xs"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-yellow-200/60">Platform:</span>
                          <span className="ml-2 text-yellow-100 font-semibold">
                            {click.platform || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-yellow-200/60">Link Type:</span>
                          <span className="ml-2 text-yellow-100">{click.link_type || '—'}</span>
                        </div>
                        <div>
                          <span className="text-yellow-200/60">Link ID:</span>
                          <span className="ml-2 text-yellow-100 font-mono text-[10px]">
                            {click.link_id ? click.link_id.slice(0, 8) + '...' : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-yellow-200/60">Created:</span>
                          <span className="ml-2 text-yellow-100">
                            {click.created_at
                              ? new Date(click.created_at).toLocaleString()
                              : '—'}
                          </span>
                        </div>
                        {click.visitor_id && (
                          <div className="col-span-2">
                            <span className="text-yellow-200/60">Visitor ID:</span>
                            <span className="ml-2 text-yellow-100 font-mono text-[10px]">
                              {click.visitor_id.slice(0, 16)}...
                            </span>
                          </div>
                        )}
                        {click.referrer && (
                          <div className="col-span-2">
                            <span className="text-yellow-200/60">Referrer:</span>
                            <span className="ml-2 text-yellow-100 text-[10px] break-all">
                              {click.referrer}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-yellow-200/60 text-center py-4">
                  No clicks found for your user ID.
                  <br />
                  <span className="text-[10px]">
                    Try clicking a smart link button in incognito mode to test.
                  </span>
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="rounded-xl bg-black/40 border border-yellow-500/20 p-4">
              <h3 className="text-sm font-semibold text-yellow-100 mb-2">Debug Instructions</h3>
              <ol className="list-decimal list-inside space-y-1 text-xs text-yellow-200/80">
                <li>Open a smart link in incognito mode</li>
                <li>Click a platform button (Spotify, Apple Music, etc.)</li>
                <li>Return here and click "Refresh Debug Data"</li>
                <li>Check if "Total Clicks in DB" increased</li>
                <li>Review "Last 10 Clicks" to see new entries</li>
              </ol>
              <div className="mt-3 p-2 rounded bg-blue-500/20 border border-blue-500/30 text-blue-200 text-xs">
                <strong>Expected:</strong> Each platform click creates 1 row in smartlink_events
                with user_id = link creator's ID (not visitor's ID)
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
