import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, ExternalLink, TrendingUp, Calendar, RefreshCw } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SmartLinkSummary {
  link_id: string;
  total_clicks: number;
  clicks_last_30_days: number;
  first_click_at: string;
  last_click_at: string;
  top_platform: string;
}

interface ClickEvent {
  id: string;
  created_at: string;
  platform: string | null;
}

interface DailyClicks {
  date: string;
  clicks: number;
}

interface PlatformBreakdown {
  platform: string;
  clicks: number;
}

export default function SmartLinkDetailPage() {
  const { linkId } = useParams<{ linkId: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SmartLinkSummary | null>(null);
  const [clickEvents, setClickEvents] = useState<ClickEvent[]>([]);
  const [dailyClicks, setDailyClicks] = useState<DailyClicks[]>([]);
  const [platformBreakdown, setPlatformBreakdown] = useState<PlatformBreakdown[]>([]);

  const loadData = async () => {
    if (!user?.id || !linkId) return;
    setLoading(true);

    try {
      // Load summary from view
      const { data: summaryData, error: summaryError } = await supabase
        .from('v_smart_link_summary')
        .select('*')
        .eq('link_id', linkId)
        .maybeSingle();

      if (summaryError) throw summaryError;
      setSummary(summaryData);

      // Load raw click events
      const { data: clicksData, error: clicksError } = await supabase
        .from('link_click_events')
        .select('id, created_at, platform')
        .eq('link_id', linkId)
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false });

      if (clicksError) throw clicksError;

      const events = clicksData || [];
      setClickEvents(events);

      // Aggregate by day
      const dayMap = new Map<string, number>();
      for (const e of events) {
        const date = new Date(e.created_at).toISOString().split('T')[0];
        dayMap.set(date, (dayMap.get(date) || 0) + 1);
      }
      const dailyData = Array.from(dayMap.entries())
        .map(([date, clicks]) => ({ date, clicks }))
        .sort((a, b) => a.date.localeCompare(b.date));
      setDailyClicks(dailyData);

      // Aggregate by platform
      const platMap = new Map<string, number>();
      for (const e of events) {
        const p = e.platform || 'unknown';
        platMap.set(p, (platMap.get(p) || 0) + 1);
      }
      const platformData = Array.from(platMap.entries())
        .map(([platform, clicks]) => ({ platform, clicks }))
        .sort((a, b) => b.clicks - a.clicks);
      setPlatformBreakdown(platformData);
    } catch (err) {
      console.error('[SmartLinkDetail] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id, linkId]);

  // Calculate conversion funnel
  const pageViews = summary?.total_clicks || 0;
  const outboundClicks = clickEvents.length;
  const conversionRate = pageViews > 0 ? ((outboundClicks / pageViews) * 100).toFixed(1) : '0.0';

  // AI Insight (read-only)
  const aiInsight = summary?.top_platform
    ? `Most listeners clicked ${summary.top_platform}. Consider prioritizing ${summary.top_platform} links in promotions.`
    : 'Not enough data yet for insights.';

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-purple-400" />
          </div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 p-6">
        <div className="mx-auto max-w-7xl">
          <Link to="/analytics" className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6">
            <ArrowLeft className="h-4 w-4" />
            Back to Analytics
          </Link>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-white/60">No data found for this Smart Link.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Back Button */}
        <Link to="/analytics" className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Analytics
        </Link>

        {/* Header */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">Smart Link Analytics</h1>
              <p className="text-sm text-white/60">Link ID: {linkId}</p>
            </div>
            <button
              onClick={loadData}
              className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-2xl font-bold text-white">{summary.total_clicks}</div>
              <div className="text-sm text-white/60">Total Clicks</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-2xl font-bold text-white">{summary.clicks_last_30_days}</div>
              <div className="text-sm text-white/60">Last 30 Days</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-2xl font-bold text-white">{summary.top_platform || '—'}</div>
              <div className="text-sm text-white/60">Top Platform</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-medium text-white">{new Date(summary.first_click_at).toLocaleDateString()}</div>
              <div className="text-sm text-white/60">First Click</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-medium text-white">{new Date(summary.last_click_at).toLocaleDateString()}</div>
              <div className="text-sm text-white/60">Last Click</div>
            </div>
          </div>
        </div>

        {/* Click Timeline */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30">
              <TrendingUp className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Click Timeline</h2>
              <p className="text-sm text-white/60">Daily click activity over time</p>
            </div>
          </div>

          {dailyClicks.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyClicks}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Line type="monotone" dataKey="clicks" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-white/60">No timeline data available</div>
          )}
        </div>

        {/* Platform Breakdown */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30">
              <ExternalLink className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Platform Breakdown</h2>
              <p className="text-sm text-white/60">Clicks by streaming platform</p>
            </div>
          </div>

          {platformBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={platformBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="platform" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Bar dataKey="clicks" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-white/60">No platform data available</div>
          )}
        </div>

        {/* Conversion Funnel */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30">
              <Calendar className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Conversion Funnel</h2>
              <p className="text-sm text-white/60">Link performance metrics</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-2xl font-bold text-white">{pageViews}</div>
              <div className="text-sm text-white/60">Page Views</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-2xl font-bold text-white">{outboundClicks}</div>
              <div className="text-sm text-white/60">Outbound Clicks</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-2xl font-bold text-white">{conversionRate}%</div>
              <div className="text-sm text-white/60">Conversion Rate</div>
            </div>
          </div>
        </div>

        {/* AI Insight */}
        <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-pink-500/10 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20 border border-purple-500/30 flex-shrink-0">
              <TrendingUp className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">AI Insight</h3>
              <p className="text-white/80">{aiInsight}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
