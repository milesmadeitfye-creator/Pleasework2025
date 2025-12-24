import { Monitor, Smartphone, Tablet, Clock } from 'lucide-react';
import type { SmartlinkAnalyticsData } from '../../hooks/useSmartlinkAnalytics';

interface Props {
  data: Pick<SmartlinkAnalyticsData, 'deviceSplit' | 'browserSplit' | 'peakHour' | 'loading' | 'error'>;
}

export function AudienceDemographicsCard({ data }: Props) {
  const { deviceSplit, browserSplit, peakHour, loading, error } = data;

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <h3 className="text-lg font-bold text-ghoste-white mb-2">Audience Demographics</h3>
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ghoste-blue"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <h3 className="text-lg font-bold text-ghoste-white mb-2">Audience Demographics</h3>
        <div className="text-sm text-red-400/80">{error}</div>
      </div>
    );
  }

  const hasData = deviceSplit.length > 0 || browserSplit.length > 0 || peakHour !== null;

  if (!hasData) {
    return (
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <h3 className="text-lg font-bold text-ghoste-white mb-2">Audience Demographics</h3>
        <p className="text-xs text-ghoste-grey mb-2">Last 30 days</p>
        <div className="flex items-center justify-center h-32 text-ghoste-grey/60 text-sm">
          No audience data yet. Share your smart links to start tracking.
        </div>
      </div>
    );
  }

  const deviceIcons: Record<string, any> = {
    Mobile: Smartphone,
    Desktop: Monitor,
    Tablet: Tablet,
  };

  const totalDevices = deviceSplit.reduce((sum, d) => sum + d.count, 0);
  const totalBrowsers = browserSplit.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
      <h3 className="text-lg font-bold text-ghoste-white mb-1">Audience Demographics</h3>
      <p className="text-xs text-ghoste-grey mb-4">Last 30 days</p>

      <div className="space-y-6">
        {/* Device Split */}
        {deviceSplit.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Monitor className="w-4 h-4 text-ghoste-blue" />
              <h4 className="text-sm font-semibold text-ghoste-white">Device Types</h4>
            </div>
            <div className="space-y-2">
              {deviceSplit.slice(0, 3).map((device) => {
                const Icon = deviceIcons[device.device] || Monitor;
                const percentage = totalDevices > 0 ? (device.count / totalDevices) * 100 : 0;

                return (
                  <div key={device.device}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Icon className="w-3 h-3 text-ghoste-grey" />
                        <span className="text-xs text-ghoste-white">{device.device}</span>
                      </div>
                      <span className="text-xs text-ghoste-grey">
                        {device.count} ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-ghoste-blue to-blue-400 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Browser Split */}
        {browserSplit.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-ghoste-white mb-3">Top Browsers</h4>
            <div className="grid grid-cols-2 gap-2">
              {browserSplit.slice(0, 4).map((browser) => {
                const percentage = totalBrowsers > 0 ? (browser.count / totalBrowsers) * 100 : 0;

                return (
                  <div
                    key={browser.browser}
                    className="rounded-xl border border-white/5 bg-black/20 p-3"
                  >
                    <div className="text-xs text-ghoste-grey">{browser.browser}</div>
                    <div className="text-lg text-ghoste-white font-semibold mt-1">
                      {percentage.toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-ghoste-grey/60">{browser.count} clicks</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Peak Hour */}
        {peakHour !== null && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-ghoste-blue" />
              <h4 className="text-sm font-semibold text-ghoste-white">Peak Click Hour</h4>
            </div>
            <div className="rounded-xl border border-ghoste-blue/20 bg-ghoste-blue/10 p-3">
              <div className="text-2xl text-ghoste-white font-bold">
                {peakHour === 0 ? '12 AM' : peakHour < 12 ? `${peakHour} AM` : peakHour === 12 ? '12 PM' : `${peakHour - 12} PM`}
              </div>
              <div className="text-xs text-ghoste-grey mt-1">Most active time</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
