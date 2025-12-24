import { useMemo, useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { ExternalLink, TrendingUp, Filter, Calendar, Link as LinkIcon, RefreshCw } from "lucide-react";

function formatDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface ClickEvent {
  id: string;
  created_at: string;
  platform: string | null;
  link_id: string | null;
  link_type: string | null;
}

export default function SmartLinkClicksPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number>(0);
  const [today, setToday] = useState<number>(0);
  const [platforms, setPlatforms] = useState<Array<{ platform: string; clicks: number }>>([]);
  const [byDay, setByDay] = useState<Array<{ day: string; clicks: number }>>([]);
  const [clickEvents, setClickEvents] = useState<ClickEvent[]>([]);
  const [uniqueLinks, setUniqueLinks] = useState<number>(0);

  // Filters
  const [dateRange, setDateRange] = useState<"7" | "30" | "90">("30");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const canLoad = !!user?.id;

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const now = new Date();
      const sinceDays = new Date(now);
      sinceDays.setDate(sinceDays.getDate() - parseInt(dateRange));

      const startToday = new Date(now);
      startToday.setHours(0, 0, 0, 0);

      // Query smartlink_events_analytics (canonical deduped source)
      let query = supabase
        .from("smartlink_events_analytics")
        .select("id, created_at, platform, smart_link_id", { count: 'exact' })
        .eq("owner_user_id", user.id)
        .gte("created_at", sinceDays.toISOString())
        .order("created_at", { ascending: false });

      if (platformFilter !== "all") {
        query = query.eq("platform", platformFilter);
      }

      const { data, error } = await query;

      // DEV LOG
      console.log('[SmartLinkClicksPanel] Table: smartlink_events_analytics, User:', user.id, 'Rows:', data?.length || 0);

      if (error) {
        console.error('[SmartLinkClicksPanel] Query error:', error);
        throw error;
      }

      const rows = (data || []) as any[];

      // Map to ClickEvent format
      const events: ClickEvent[] = rows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        platform: r.platform || null,
        link_id: r.smart_link_id || null,
        link_type: "smart_link",
      }));

      setClickEvents(events);

      // Calculate totals
      setTotal(events.length);

      // Today count
      const todayCount = events.filter((e) => new Date(e.created_at) >= startToday).length;
      setToday(todayCount);

      // Unique links
      const uniqueLinkIds = new Set(events.map((e) => e.link_id).filter(Boolean));
      setUniqueLinks(uniqueLinkIds.size);

      // By day aggregation
      const dayMap = new Map<string, number>();
      for (const e of events) {
        const day = formatDay(new Date(e.created_at));
        dayMap.set(day, (dayMap.get(day) || 0) + 1);
      }
      const dayArr = Array.from(dayMap.entries())
        .map(([day, clicks]) => ({ day, clicks }))
        .sort((a, b) => a.day.localeCompare(b.day));
      setByDay(dayArr);

      // By platform aggregation
      const platMap = new Map<string, number>();
      for (const e of events) {
        const p = (e.platform || "unknown").toString();
        platMap.set(p, (platMap.get(p) || 0) + 1);
      }
      const platArr = Array.from(platMap.entries())
        .map(([platform, clicks]) => ({ platform, clicks }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10);
      setPlatforms(platArr);
    } catch (e) {
      console.error("[SmartLinkClicksPanel] load failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canLoad) {
      load();
    }
  }, [canLoad, dateRange, platformFilter]);

  const topPlatform = useMemo(() => {
    if (!platforms || platforms.length === 0) return "—";
    return platforms[0].platform;
  }, [platforms]);

  // Get unique platform options for filter
  const platformOptions = useMemo(() => {
    const allPlatforms = new Set(clickEvents.map((e) => e.platform).filter(Boolean));
    return Array.from(allPlatforms).sort();
  }, [clickEvents]);

  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30">
            <ExternalLink className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Link Clicks</h2>
            <p className="text-sm text-white/60">Detailed click analytics from your smart links</p>
          </div>
        </div>

        <button
          disabled={!canLoad || loading}
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {!canLoad && (
        <div className="mt-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-200 border border-red-500/20">
          Sign in to view link click analytics.
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-white/50" />
          <span className="text-sm text-white/70">Date Range:</span>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as "7" | "30" | "90")}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white hover:bg-black/50 transition-colors"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-white/50" />
          <span className="text-sm text-white/70">Platform:</span>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white hover:bg-black/50 transition-colors capitalize"
          >
            <option value="all">All Platforms</option>
            {platformOptions.map((platform) => (
              <option key={platform} value={platform} className="capitalize">
                {platform?.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-black/30 transition-colors">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-white/50" />
            <div className="text-xs text-white/50">Total Clicks</div>
          </div>
          <div className="mt-2 text-3xl font-semibold text-white">{total.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/40">
            {dateRange === "7" ? "Last 7 days" : dateRange === "30" ? "Last 30 days" : "Last 90 days"}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-black/30 transition-colors">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></div>
            <div className="text-xs text-white/50">Today</div>
          </div>
          <div className="mt-2 text-3xl font-semibold text-white">{today.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/40">Clicks today</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-black/30 transition-colors">
          <div className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-white/50" />
            <div className="text-xs text-white/50">Unique Links</div>
          </div>
          <div className="mt-2 text-3xl font-semibold text-white">{uniqueLinks.toLocaleString()}</div>
          <div className="mt-1 text-xs text-white/40">Links clicked</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-black/30 transition-colors">
          <div className="text-xs text-white/50">Top Platform</div>
          <div className="mt-2 text-xl font-semibold text-white capitalize">
            {topPlatform.replace(/_/g, " ")}
          </div>
          <div className="mt-1 text-xs text-white/40">Most clicked</div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 text-sm font-semibold text-white">Clicks by Day</div>
          {byDay.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-white/50">
              No click data yet. Share a smart link and refresh.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {byDay.slice(-10).reverse().map((d) => (
                <div
                  key={d.day}
                  className="flex items-center justify-between text-sm text-white/80 hover:bg-white/5 p-2 rounded transition-colors"
                >
                  <span>{d.day}</span>
                  <span className="font-semibold text-white">{d.clicks}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 text-sm font-semibold text-white">Top Platforms</div>
          {platforms.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-white/50">
              No platform clicks yet.
            </div>
          ) : (
            <div className="space-y-2">
              {platforms.map((p) => (
                <div
                  key={p.platform}
                  className="flex items-center justify-between text-sm text-white/80 hover:bg-white/5 p-2 rounded transition-colors"
                >
                  <span className="capitalize">{p.platform.replace(/_/g, " ")}</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-1.5 rounded-full bg-blue-400"
                      style={{
                        width: `${(p.clicks / platforms[0].clicks) * 60}px`,
                        minWidth: "8px",
                      }}
                    ></div>
                    <span className="font-semibold text-white">{p.clicks}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detailed Click Events Table */}
      <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Recent Clicks</h3>
          <span className="text-xs text-white/50">{clickEvents.length} total</span>
        </div>

        {clickEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <ExternalLink className="h-12 w-12 text-white/20 mb-3" />
            <p className="text-sm text-white/60 font-medium">No link activity yet</p>
            <p className="text-xs text-white/40 mt-1 max-w-md">
              Create and share smart links to start tracking clicks. Each platform button click will
              appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="pb-2 text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="pb-2 text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="pb-2 text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Platform
                  </th>
                  <th className="pb-2 text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Link ID
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {clickEvents.slice(0, 50).map((event) => {
                  const date = new Date(event.created_at);
                  return (
                    <tr
                      key={event.id}
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="py-2 text-white/80">
                        {date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-2 text-white/80">
                        {date.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </td>
                      <td className="py-2">
                        <span className="inline-flex items-center rounded-full bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 text-xs font-medium text-blue-300 capitalize">
                          {(event.platform || "unknown").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-2 text-white/60 font-mono text-xs">
                        {event.link_id ? `${event.link_id.slice(0, 8)}...` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {clickEvents.length > 50 && (
              <div className="mt-4 text-center text-xs text-white/40">
                Showing 50 of {clickEvents.length} clicks. Use filters to narrow results.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-white/40">
        Smart link click tracking is recorded server-side for reliability. Data updates in real-time.
      </div>
    </div>
  );
}
