import { TrendingUp, Music, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { SmartlinkAnalyticsData } from '../../hooks/useSmartlinkAnalytics';

interface Props {
  data: Pick<SmartlinkAnalyticsData, 'topLinks' | 'topPlatforms' | 'mostActiveDay' | 'loading' | 'error'>;
}

export function TopPerformingAssetsCard({ data }: Props) {
  const { topLinks, topPlatforms, mostActiveDay, loading, error } = data;
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <h3 className="text-lg font-bold text-ghoste-white mb-2">Top Performing Assets</h3>
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ghoste-blue"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <h3 className="text-lg font-bold text-ghoste-white mb-2">Top Performing Assets</h3>
        <div className="text-sm text-red-400/80">{error}</div>
      </div>
    );
  }

  const hasData = topLinks.length > 0 || topPlatforms.length > 0 || mostActiveDay !== null;

  if (!hasData) {
    return (
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <h3 className="text-lg font-bold text-ghoste-white mb-2">Top Performing Assets</h3>
        <p className="text-xs text-ghoste-grey mb-2">Last 30 days</p>
        <div className="flex items-center justify-center h-32 text-ghoste-grey/60 text-sm">
          No performance data yet. Create smart links to start tracking.
        </div>
      </div>
    );
  }

  const maxLinkClicks = Math.max(...topLinks.map(l => l.clicks), 1);
  const maxPlatformClicks = Math.max(...topPlatforms.map(p => p.clicks), 1);

  const handleLinkClick = (linkId: string, slug: string) => {
    if (slug) {
      navigate(`/links?highlight=${linkId}`);
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
      <h3 className="text-lg font-bold text-ghoste-white mb-1">Top Performing Assets</h3>
      <p className="text-xs text-ghoste-grey mb-4">Last 30 days</p>

      <div className="space-y-6">
        {/* Top Smart Links */}
        {topLinks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-ghoste-blue" />
              <h4 className="text-sm font-semibold text-ghoste-white">Top Smart Links</h4>
            </div>
            <div className="space-y-2">
              {topLinks.slice(0, 5).map((link, index) => {
                const barWidth = (link.clicks / maxLinkClicks) * 100;

                return (
                  <div
                    key={link.id}
                    className="group cursor-pointer"
                    onClick={() => handleLinkClick(link.id, link.slug)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-[10px] text-ghoste-grey/60 font-mono">
                          #{index + 1}
                        </span>
                        <span className="text-xs text-ghoste-white truncate group-hover:text-ghoste-blue transition-colors">
                          {link.title}
                        </span>
                      </div>
                      <span className="text-xs text-ghoste-grey font-semibold ml-2">
                        {link.clicks}
                      </span>
                    </div>
                    <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-ghoste-blue to-blue-400 rounded-full group-hover:from-blue-500 group-hover:to-blue-300 transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Platforms */}
        {topPlatforms.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Music className="w-4 h-4 text-ghoste-blue" />
              <h4 className="text-sm font-semibold text-ghoste-white">Top Platforms</h4>
            </div>
            <div className="space-y-2">
              {topPlatforms.slice(0, 5).map((platform) => {
                const barWidth = (platform.clicks / maxPlatformClicks) * 100;

                return (
                  <div key={platform.platform}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-ghoste-white capitalize">
                        {platform.platform.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-ghoste-grey">{platform.clicks}</span>
                    </div>
                    <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Most Active Day */}
        {mostActiveDay && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-ghoste-blue" />
              <h4 className="text-sm font-semibold text-ghoste-white">Most Active Day</h4>
            </div>
            <div className="rounded-xl border border-ghoste-blue/20 bg-ghoste-blue/10 p-3">
              <div className="text-lg text-ghoste-white font-bold">
                {new Date(mostActiveDay.date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
              <div className="text-xs text-ghoste-grey mt-1">
                {mostActiveDay.clicks} clicks
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Helpful tip */}
      {topLinks.length > 0 && (
        <div className="mt-4 text-[10px] text-ghoste-grey/60 italic">
          Click any link to view details
        </div>
      )}
    </div>
  );
}
