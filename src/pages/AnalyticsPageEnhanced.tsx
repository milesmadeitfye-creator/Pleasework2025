import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "@/lib/supabase.client";
import { RefreshCw, Search, TrendingUp, Users, Music, Play, Heart, Eye, Sparkles, MousePointerClick, ExternalLink, Bug } from "lucide-react";
import { fetchSongstatsAnalytics } from "../services/analytics/songstatsClient";
import { buildGhosteAnalyticsView } from "../services/analytics/songstatsAdapter";
import { GhosteStatCard } from "../components/analytics/GhosteStatCard";
import { GhosteLineChart } from "../components/analytics/GhosteLineChart";
import { GhosteBarChart } from "../components/analytics/GhosteBarChart";
import { GhosteAIInsightsPanel } from "../components/analytics/GhosteAIInsightsPanel";
import { loadSelectedArtist, saveSelectedArtist } from "../stores/analyticsStore";

type TabType = "overview" | "spotify" | "tiktok" | "instagram" | "youtube";

export default function AnalyticsPageEnhanced() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  const debug = new URLSearchParams(window.location.search).get("debug") === "1";
  const showAnalyticsDebug = import.meta.env.DEV && debug;

  const [debugResults, setDebugResults] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  const [clicksData, setClicksData] = useState<any[]>([]);
  const [clicksLoading, setClicksLoading] = useState(false);
  const [clicksTotal, setClicksTotal] = useState(0);

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

  const [selectedCandidate, setSelectedCandidate] = useState<typeof results[0] | null>(null);
  const [activeArtist, setActiveArtist] = useState<typeof results[0] | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [raw, setRaw] = useState<any>(null);
  const [view, setView] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [status, setStatus] = useState<"idle" | "pending" | "ready" | "error">("idle");

  // AI Insights Panel
  const [showAIPanel, setShowAIPanel] = useState(false);

  // Load persisted artist on mount
  useEffect(() => {
    const persisted = loadSelectedArtist();
    if (persisted?.spotify_artist_id) {
      setActiveArtist({
        spotify_artist_id: persisted.spotify_artist_id,
        name: persisted.name,
        image: persisted.image || null,
        followers: persisted.followers || null,
        popularity: persisted.popularity || null,
        genres: persisted.genres || [],
      });
      setIsPickerOpen(false);
    }
  }, []);

  const canLoad = !!activeArtist?.spotify_artist_id;

  const load = async (force = false) => {
    if (!canLoad) return;
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchSongstatsAnalytics({
        spotifyArtistId: activeArtist!.spotify_artist_id,
        force
      });

      setStatus(data.status || "ready");

      if (data.status === "pending") {
        setRaw(null);
        setView(null);
        return;
      }

      if (data.status === "error") {
        setErr(data.message || "Songstats error");
        setRaw(null);
        setView(null);
        return;
      }

      setRaw(data);
      setView(buildGhosteAnalyticsView(data));
    } catch (e: any) {
      setErr(e?.message || "Failed to load analytics");
      setRaw(null);
      setView(null);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeArtist) return;
    load(refreshKey > 0);
  }, [refreshKey, activeArtist?.spotify_artist_id]);

  const runDebugQueries = async () => {
    if (!user?.id) {
      setDebugResults({ error: "No user ID found" });
      return;
    }

    setDebugLoading(true);
    try {
      const totalRes = await supabase
        .from("v_link_click_events")
        .select("*", { count: "exact", head: true })
        .eq("link_type", "smart_link");

      const mineRes = await supabase
        .from("v_link_click_events")
        .select("id, created_at, owner_user_id, link_id, platform, slug, url", { count: "exact" })
        .eq("owner_user_id", user.id)
        .eq("link_type", "smart_link")
        .order("created_at", { ascending: false })
        .limit(10);

      setDebugResults({
        total: {
          count: totalRes.count,
          error: totalRes.error,
        },
        mine: {
          count: mineRes.count,
          data: mineRes.data,
          error: mineRes.error,
        },
      });
    } catch (e: any) {
      setDebugResults({ error: e.message });
    } finally {
      setDebugLoading(false);
    }
  };

  const loadSmartLinkClicks = async () => {
    if (!user?.id) return;
    setClicksLoading(true);
    try {
      const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error, count } = await supabase
        .from("v_link_click_events")
        .select("id, created_at, platform, link_id, slug, url", { count: "exact" })
        .eq("owner_user_id", user.id)
        .eq("link_type", "smart_link")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      setClicksData(data || []);
      setClicksTotal(count || 0);
    } catch (e) {
      console.error("Failed to load clicks:", e);
      setClicksData([]);
    } finally {
      setClicksLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadSmartLinkClicks();
    }
  }, [user?.id]);

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
          "Cache-Control": "no-store",
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
  };

  const saveCandidate = async () => {
    if (!selectedCandidate) return;
    setIsSaving(true);
    setErr(null);

    try {
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

      // Save to localStorage for persistence
      saveSelectedArtist({
        spotify_artist_id: selectedCandidate.spotify_artist_id,
        name: selectedCandidate.name,
        image: selectedCandidate.image,
        followers: selectedCandidate.followers,
        popularity: selectedCandidate.popularity,
        genres: selectedCandidate.genres,
      });

      setActiveArtist(selectedCandidate);
      setResults([]);
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setIsPickerOpen(true);
      console.error("Save artist error:", e);
      setErr(e?.message || "Failed to save artist");
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: TrendingUp },
    { id: "spotify", label: "Spotify", icon: Music },
    { id: "tiktok", label: "TikTok", icon: Play },
    { id: "instagram", label: "Instagram", icon: Heart },
    { id: "youtube", label: "YouTube", icon: Eye },
  ];

  const renderTabContent = () => {
    if (status === "pending") {
      return (
        <div className="rounded-2xl border border-yellow-200/20 bg-yellow-200/10 p-6 text-center">
          <div className="text-lg font-semibold text-yellow-100">Indexing artist in Songstats...</div>
          <div className="mt-2 text-sm text-yellow-100/80">This artist is being indexed. Check back in a few minutes.</div>
        </div>
      );
    }

    if (status === "error" && err) {
      return (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-6 text-center">
          <div className="text-lg font-semibold text-red-200">Error</div>
          <div className="mt-2 text-sm text-red-300">{err}</div>
        </div>
      );
    }

    if (!view || !view.cards.length) {
      return (
        <div className="rounded-2xl border border-white/10 bg-black/35 p-6 text-center text-white/70">
          No analytics data available yet. Select an artist and refresh to load data.
        </div>
      );
    }

    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {view.cards.slice(0, 8).map((c: any, idx: number) => (
                <GhosteStatCard
                  key={c.key || idx}
                  title={c.title}
                  value={c.value}
                  sub={c.sub}
                />
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                {view.trendData?.length ? (
                  <GhosteLineChart data={view.trendData} title="Growth Trend" />
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-6 text-white/65 text-center">
                    Trend data not available yet from Songstats.
                  </div>
                )}
              </div>

              <div>
                {view.breakdownData?.length ? (
                  <GhosteBarChart data={view.breakdownData} title="Platform Breakdown" />
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-6 text-white/65 text-center">
                    Platform breakdown not available yet from Songstats.
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case "spotify":
        const spotifyCards = view.cards.filter((c: any) =>
          c.key.includes("spotify") || c.key.includes("streams")
        );
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {spotifyCards.length > 0 ? spotifyCards.map((c: any, idx: number) => (
                <GhosteStatCard key={c.key || idx} title={c.title} value={c.value} sub={c.sub} icon={<Music className="w-5 h-5 text-green-400" />} />
              )) : (
                <div className="col-span-full rounded-2xl border border-white/10 bg-black/35 p-6 text-white/65 text-center">
                  Spotify metrics will appear here once available.
                </div>
              )}
            </div>
          </div>
        );

      case "tiktok":
        const tiktokCards = view.cards.filter((c: any) => c.key.includes("tt_"));
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tiktokCards.length > 0 ? tiktokCards.map((c: any, idx: number) => (
                <GhosteStatCard key={c.key || idx} title={c.title} value={c.value} sub={c.sub} icon={<Play className="w-5 h-5 text-pink-400" />} />
              )) : (
                <div className="col-span-full rounded-2xl border border-white/10 bg-black/35 p-6 text-white/65 text-center">
                  TikTok metrics will appear here once available.
                </div>
              )}
            </div>
          </div>
        );

      case "instagram":
        const igCards = view.cards.filter((c: any) => c.key.includes("ig_"));
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {igCards.length > 0 ? igCards.map((c: any, idx: number) => (
                <GhosteStatCard key={c.key || idx} title={c.title} value={c.value} sub={c.sub} icon={<Heart className="w-5 h-5 text-purple-400" />} />
              )) : (
                <div className="col-span-full rounded-2xl border border-white/10 bg-black/35 p-6 text-white/65 text-center">
                  Instagram metrics will appear here once available.
                </div>
              )}
            </div>
          </div>
        );

      case "youtube":
        const ytCards = view.cards.filter((c: any) => c.key.includes("yt_"));
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ytCards.length > 0 ? ytCards.map((c: any, idx: number) => (
                <GhosteStatCard key={c.key || idx} title={c.title} value={c.value} sub={c.sub} icon={<Eye className="w-5 h-5 text-red-400" />} />
              )) : (
                <div className="col-span-full rounded-2xl border border-white/10 bg-black/35 p-6 text-white/65 text-center">
                  YouTube metrics will appear here once available.
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-full px-4 md:px-6 pb-6 space-y-6">
      {/* Proof-of-Life Banner */}
      {showAnalyticsDebug && (
      <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
        <div className="font-semibold">✅ Analytics UI Updated - v_link_click_events VIEW</div>
        <div className="text-xs opacity-80">
          Build marker: GHOSTE_ANALYTICS_MARKER_2025_12_17_v3
        </div>
        <div className="text-xs opacity-60 mt-1">
          File: src/pages/AnalyticsPageEnhanced.tsx • Route: /analytics • Debug: /analytics?debug=1
        </div>
        <div className="mt-2 space-x-3">
          <a
            className="underline text-sm opacity-80 hover:opacity-100"
            href="/api/debug/link-clicks"
            target="_blank"
            rel="noreferrer"
          >
            Open click debugger →
          </a>
          <button
            onClick={async () => {
              if (!user?.id) return;
              try {
                // Get a smart link slug to test with
                const { data: smartLinks } = await supabase
                  .from("smart_links")
                  .select("slug")
                  .eq("user_id", user.id)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (!smartLinks?.slug) {
                  alert("❌ No smart links found. Create a smart link first.");
                  return;
                }

                const res = await fetch("/.netlify/functions/smartlink-track-click", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    slug: smartLinks.slug,
                    platform: "debug_test",
                    url: window.location.href,
                    referrer: "analytics-debug",
                    metadata: { test: true, debug: true },
                    user_id: user.id,
                  }),
                });
                const json = await res.json();
                alert(json.ok ? "✅ Test click inserted!" : `❌ ${json.error}`);
                await loadSmartLinkClicks();
              } catch (e: any) {
                alert(`❌ ${e.message}`);
              }
            }}
            className="underline text-sm opacity-80 hover:opacity-100"
          >
            Test insert click
          </button>
        </div>
      </div>
      )}

      {/* Debug Panel */}
      {debug && (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bug className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-bold text-purple-200">Debug Mode</h3>
          </div>

          <div className="space-y-3 text-sm text-purple-100">
            <div>
              <span className="opacity-70">Current Route:</span> /analytics
            </div>
            <div>
              <span className="opacity-70">Component:</span> src/pages/AnalyticsPageEnhanced.tsx
            </div>
            <div>
              <span className="opacity-70">User ID:</span> {user?.id || "Not logged in"}
            </div>

            <button
              onClick={runDebugQueries}
              disabled={debugLoading}
              className="mt-3 rounded-lg bg-purple-600/80 hover:bg-purple-600 px-4 py-2 text-white font-medium transition disabled:opacity-50"
            >
              {debugLoading ? "Running..." : "Run Debug Queries"}
            </button>

            {debugResults && (
              <pre className="mt-4 rounded-lg bg-black/50 p-4 text-xs overflow-auto max-h-96 text-purple-200">
                {JSON.stringify(debugResults, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="text-xl md:text-2xl font-semibold text-white">Analytics</div>
          <div className="text-sm text-white/60">Ghoste-branded insights powered by Songstats</div>
        </div>

        <div className="flex gap-2">
          <button
            className="rounded-xl px-4 py-3 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-60 inline-flex items-center gap-2 text-sm text-white transition"
            disabled={!canLoad}
            onClick={() => setShowAIPanel(true)}
          >
            <Sparkles className="w-4 h-4 text-blue-400" />
            Ask Ghoste AI
          </button>
          <button
            className="rounded-xl px-4 py-3 border border-white/10 bg-white/10 hover:bg-white/15 disabled:opacity-60 inline-flex items-center gap-2 text-sm text-white transition"
            disabled={!canLoad || loading}
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Artist Search Section */}
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <Search className="w-5 h-5 text-ghoste-blue" />
          <h2 className="text-lg font-bold text-ghoste-white">Artist Search</h2>
        </div>

        <p className="text-xs text-ghoste-grey mb-4">
          Search for an artist to track their cross-platform analytics (persists across sessions)
        </p>

        {/* Pinned Artist */}
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
                  <div className="text-xs text-white/60">Tracking analytics</div>
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
                  ? (isSaving ? "Saving..." : "Save & Track")
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

        {err && <div className="text-sm text-red-300 mt-2">{err}</div>}
      </div>

      {/* Tabs */}
      {canLoad && (
        <>
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={
                    "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition inline-flex items-center gap-2 " +
                    (isActive
                      ? "bg-ghoste-blue text-white shadow-[0_0_18px_rgba(26,108,255,0.6)]"
                      : "bg-white/5 text-white/70 hover:bg-white/10")
                  }
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          {renderTabContent()}
        </>
      )}

      {/* No artist selected */}
      {!canLoad && (
        <div className="rounded-2xl border border-white/10 bg-black/35 p-6 text-white/70 text-center">
          Search and select an artist above to view analytics. Your selection will persist across sessions.
        </div>
      )}

      {/* Smart Link Clicks Section */}
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <MousePointerClick className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Smart Link Clicks (last 30 days)</h2>
          </div>
          <button
            onClick={loadSmartLinkClicks}
            disabled={clicksLoading}
            className="rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${clicksLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Total Clicks KPI */}
        <div className="mb-4">
          <div className="text-3xl font-bold text-white">{clicksTotal.toLocaleString()}</div>
          <div className="text-sm text-white/60">Total clicks tracked</div>
        </div>

        {/* Clicks Table */}
        {clicksLoading ? (
          <div className="text-center py-8 text-white/60">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading click data...
          </div>
        ) : clicksData.length === 0 ? (
          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-6 text-center">
            <div className="text-yellow-200 font-semibold mb-2">No click data yet</div>
            <div className="text-sm text-yellow-200/80">
              This means clicks aren't being inserted into the <code className="bg-black/30 px-1 rounded">link_click_events</code> table.
              Check your Smart Link tracking implementation.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 px-3 text-white/70 font-medium">Date</th>
                  <th className="text-left py-2 px-3 text-white/70 font-medium">Time</th>
                  <th className="text-left py-2 px-3 text-white/70 font-medium">Platform</th>
                  <th className="text-left py-2 px-3 text-white/70 font-medium">Link ID</th>
                </tr>
              </thead>
              <tbody>
                {clicksData.map((click, idx) => {
                  const date = new Date(click.created_at);
                  return (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3 text-white">{date.toLocaleDateString()}</td>
                      <td className="py-2 px-3 text-white/80">{date.toLocaleTimeString()}</td>
                      <td className="py-2 px-3">
                        <span className="inline-block rounded-full bg-blue-500/20 text-blue-300 px-2 py-0.5 text-xs font-medium">
                          {click.platform || 'unknown'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-white/60 font-mono text-xs">
                        {click.link_id?.substring(0, 8)}...
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {clicksData.length >= 50 && (
              <div className="mt-3 text-center text-xs text-white/50">
                Showing most recent 50 clicks
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Insights Panel */}
      <GhosteAIInsightsPanel
        isOpen={showAIPanel}
        onClose={() => setShowAIPanel(false)}
        spotifyArtistId={activeArtist?.spotify_artist_id}
        artistName={activeArtist?.name}
      />
    </div>
  );
}
