import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Link2, TrendingUp, BarChart3, Target } from 'lucide-react';
import { GhosteBarChart } from './GhosteBarChart';

interface PlatformStats {
  platform: string;
  click_count: number;
  percentage: number;
}

interface OneClickStats {
  total_clicks: number;
  unique_links: number;
  platforms: PlatformStats[];
  top_platform: string | null;
  top_platform_percentage: number;
}

export default function OneClickAnalyticsPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OneClickStats>({
    total_clicks: 0,
    unique_links: 0,
    platforms: [],
    top_platform: null,
    top_platform_percentage: 0,
  });

  useEffect(() => {
    if (user) {
      loadOneClickAnalytics();
    }
  }, [user]);

  const loadOneClickAnalytics = async () => {
    if (!user) return;

    setLoading(true);

    try {
      const { data: clickData, error: clickError } = await supabase
        .from('link_click_events')
        .select('platform, link_id')
        .eq('owner_user_id', user.id)
        .eq('event_family', 'one_click');

      if (clickError) throw clickError;

      const totalClicks = clickData?.length || 0;
      const uniqueLinks = new Set(clickData?.map(d => d.link_id)).size;

      const platformCounts: Record<string, number> = {};
      clickData?.forEach(click => {
        const platform = click.platform || 'other';
        platformCounts[platform] = (platformCounts[platform] || 0) + 1;
      });

      const platforms: PlatformStats[] = Object.entries(platformCounts)
        .map(([platform, count]) => ({
          platform: formatPlatformName(platform),
          click_count: count,
          percentage: totalClicks > 0 ? (count / totalClicks) * 100 : 0,
        }))
        .sort((a, b) => b.click_count - a.click_count);

      const topPlatform = platforms[0]?.platform || null;
      const topPlatformPercentage = platforms[0]?.percentage || 0;

      setStats({
        total_clicks: totalClicks,
        unique_links: uniqueLinks,
        platforms,
        top_platform: topPlatform,
        top_platform_percentage: topPlatformPercentage,
      });
    } catch (err) {
      console.error('[OneClickAnalytics] Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatPlatformName = (platform: string): string => {
    const map: Record<string, string> = {
      spotify: 'Spotify',
      applemusic: 'Apple Music',
      youtube: 'YouTube',
      amazonmusic: 'Amazon Music',
      tidal: 'TIDAL',
      deezer: 'Deezer',
      soundcloud: 'SoundCloud',
      audiomack: 'Audiomack',
      web: 'Web',
      other: 'Other',
    };
    return map[platform] || platform;
  };

  const getPlatformIcon = (platform: string) => {
    return '🎵';
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-2xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-800 rounded w-1/3"></div>
          <div className="h-32 bg-gray-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (stats.total_clicks === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-2xl p-8 text-center">
        <Link2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No One-Click Link Data Yet</h3>
        <p className="text-gray-400 text-sm">
          Create and share One-Click Links to see platform performance data here.
        </p>
      </div>
    );
  }

  const chartData = stats.platforms.slice(0, 8).map(p => ({
    name: p.platform,
    value: p.click_count,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-900/20 to-blue-950/20 border border-blue-800/50 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Link2 className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-400">Total Clicks</h3>
          </div>
          <p className="text-3xl font-bold text-white">{stats.total_clicks.toLocaleString()}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-900/20 to-purple-950/20 border border-purple-800/50 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <BarChart3 className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-400">Active Links</h3>
          </div>
          <p className="text-3xl font-bold text-white">{stats.unique_links}</p>
        </div>

        <div className="bg-gradient-to-br from-green-900/20 to-green-950/20 border border-green-800/50 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-400">Top Platform</h3>
          </div>
          <p className="text-2xl font-bold text-white">{stats.top_platform || 'N/A'}</p>
          {stats.top_platform && (
            <p className="text-sm text-gray-400 mt-1">
              {stats.top_platform_percentage.toFixed(0)}% of clicks
            </p>
          )}
        </div>
      </div>

      <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">Platform Distribution</h3>
        </div>

        {chartData.length > 0 && (
          <div className="h-64 mb-6">
            <GhosteBarChart
              data={chartData}
              xKey="name"
              yKey="value"
              color="#3b82f6"
            />
          </div>
        )}

        <div className="space-y-3">
          {stats.platforms.map((platform, index) => (
            <div
              key={platform.platform}
              className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getPlatformIcon(platform.platform)}</span>
                <div>
                  <p className="text-sm font-medium text-white">{platform.platform}</p>
                  <p className="text-xs text-gray-400">{platform.click_count.toLocaleString()} clicks</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-blue-400">{platform.percentage.toFixed(1)}%</p>
              </div>
            </div>
          ))}
        </div>

        {stats.top_platform && stats.top_platform_percentage > 50 && (
          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
            <div className="flex items-start gap-3">
              <Target className="w-5 h-5 text-blue-400 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-white mb-1">Targeting Opportunity</h4>
                <p className="text-sm text-gray-300">
                  {stats.top_platform} is {stats.top_platform_percentage.toFixed(0)}% of your clicks.
                  Consider running a {stats.top_platform}-focused campaign or building a custom
                  audience from <span className="font-mono text-blue-400">oneclick{stats.top_platform.toLowerCase().replace(/\s+/g, '')}</span> events.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
