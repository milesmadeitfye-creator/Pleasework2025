import { ExternalLink, Tag } from 'lucide-react';
import type { SmartlinkAnalyticsData } from '../../hooks/useSmartlinkAnalytics';

interface Props {
  data: Pick<SmartlinkAnalyticsData, 'referrerCategories' | 'utmSources' | 'utmCampaigns' | 'loading' | 'error'>;
}

export function TrafficSourcesCard({ data }: Props) {
  const { referrerCategories, utmSources, utmCampaigns, loading, error } = data;

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <h3 className="text-lg font-bold text-ghoste-white mb-2">Traffic Sources</h3>
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ghoste-blue"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <h3 className="text-lg font-bold text-ghoste-white mb-2">Traffic Sources</h3>
        <div className="text-sm text-red-400/80">{error}</div>
      </div>
    );
  }

  const hasData = referrerCategories.length > 0 || utmSources.length > 0 || utmCampaigns.length > 0;

  if (!hasData) {
    return (
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <h3 className="text-lg font-bold text-ghoste-white mb-2">Traffic Sources</h3>
        <p className="text-xs text-ghoste-grey mb-2">Last 30 days</p>
        <div className="flex items-center justify-center h-32 text-ghoste-grey/60 text-sm">
          No traffic data yet. Share your smart links to start tracking.
        </div>
      </div>
    );
  }

  const totalReferrers = referrerCategories.reduce((sum, r) => sum + r.count, 0);
  const maxCount = Math.max(...referrerCategories.map(r => r.count), 1);

  return (
    <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
      <h3 className="text-lg font-bold text-ghoste-white mb-1">Traffic Sources</h3>
      <p className="text-xs text-ghoste-grey mb-4">Last 30 days</p>

      <div className="space-y-6">
        {/* Referrer Categories */}
        {referrerCategories.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ExternalLink className="w-4 h-4 text-ghoste-blue" />
              <h4 className="text-sm font-semibold text-ghoste-white">Referrer Sources</h4>
            </div>
            <div className="space-y-2">
              {referrerCategories.map((ref) => {
                const percentage = totalReferrers > 0 ? (ref.count / totalReferrers) * 100 : 0;
                const barWidth = (ref.count / maxCount) * 100;

                return (
                  <div key={ref.category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-ghoste-white">{ref.category}</span>
                      <span className="text-xs text-ghoste-grey">
                        {ref.count} ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* UTM Sources */}
        {utmSources.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-ghoste-blue" />
              <h4 className="text-sm font-semibold text-ghoste-white">Top UTM Sources</h4>
            </div>
            <div className="space-y-2">
              {utmSources.slice(0, 5).map((source) => (
                <div
                  key={source.source}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 p-2.5"
                >
                  <span className="text-xs text-ghoste-white font-mono">{source.source}</span>
                  <span className="text-xs text-ghoste-grey font-semibold">{source.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* UTM Campaigns */}
        {utmCampaigns.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-ghoste-white mb-3">Top Campaigns</h4>
            <div className="space-y-2">
              {utmCampaigns.slice(0, 5).map((campaign) => (
                <div
                  key={campaign.campaign}
                  className="flex items-center justify-between rounded-xl border border-ghoste-blue/20 bg-ghoste-blue/10 p-2.5"
                >
                  <span className="text-xs text-ghoste-white font-mono truncate">
                    {campaign.campaign}
                  </span>
                  <span className="text-xs text-blue-300 font-semibold ml-2">{campaign.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No UTM data message */}
        {utmSources.length === 0 && utmCampaigns.length === 0 && referrerCategories.length > 0 && (
          <div className="text-xs text-ghoste-grey/70 p-3 rounded-xl bg-black/20 border border-white/5">
            Add UTM parameters to your smart links for deeper campaign attribution
          </div>
        )}
      </div>
    </div>
  );
}
