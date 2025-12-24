import { Globe, MapPin, RefreshCw, Users } from 'lucide-react';
import type { SmartlinkAnalyticsData } from '../../hooks/useSmartlinkAnalytics';

interface Props {
  data: Pick<SmartlinkAnalyticsData, 'topCountries' | 'topCities' | 'osSplit' | 'newVsReturning' | 'loading' | 'error'>;
}

export function LinkClickDemographicsCard({ data }: Props) {
  const { topCountries, topCities, osSplit, newVsReturning, loading, error } = data;

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <h3 className="text-lg font-bold text-ghoste-white mb-2">Link Click Demographics</h3>
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ghoste-blue"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <h3 className="text-lg font-bold text-ghoste-white mb-2">Link Click Demographics</h3>
        <div className="text-sm text-red-400/80">{error}</div>
      </div>
    );
  }

  const hasData = topCountries.length > 0 || topCities.length > 0 || osSplit.length > 0 || newVsReturning !== null;

  if (!hasData) {
    return (
      <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
        <h3 className="text-lg font-bold text-ghoste-white mb-2">Link Click Demographics</h3>
        <p className="text-xs text-ghoste-grey mb-2">Last 30 days</p>
        <div className="flex items-center justify-center h-32 text-ghoste-grey/60 text-sm">
          No demographic data yet. Share your smart links to start tracking.
        </div>
      </div>
    );
  }

  const totalCountryClicks = topCountries.reduce((sum, c) => sum + c.count, 0);
  const totalOsClicks = osSplit.reduce((sum, os) => sum + os.count, 0);

  return (
    <div className="rounded-3xl border border-white/10 bg-ghoste-black/60 backdrop-blur-sm p-6">
      <h3 className="text-lg font-bold text-ghoste-white mb-1">Link Click Demographics</h3>
      <p className="text-xs text-ghoste-grey mb-4">Last 30 days</p>

      <div className="space-y-6">
        {/* Top Countries */}
        {topCountries.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-ghoste-blue" />
              <h4 className="text-sm font-semibold text-ghoste-white">Top Countries</h4>
            </div>
            <div className="space-y-2">
              {topCountries.slice(0, 5).map((country) => {
                const percentage = totalCountryClicks > 0 ? (country.count / totalCountryClicks) * 100 : 0;

                return (
                  <div key={country.country}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-ghoste-white">{country.country}</span>
                      <span className="text-xs text-ghoste-grey">
                        {country.count} ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Cities */}
        {topCities.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-ghoste-blue" />
              <h4 className="text-sm font-semibold text-ghoste-white">Top Cities</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {topCities.slice(0, 5).map((city) => (
                <div
                  key={city.city}
                  className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5"
                >
                  <span className="text-xs text-ghoste-white">{city.city}</span>
                  <span className="ml-2 text-xs text-ghoste-grey">{city.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OS Distribution */}
        {osSplit.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-ghoste-white mb-3">Operating Systems</h4>
            <div className="grid grid-cols-2 gap-2">
              {osSplit.slice(0, 4).map((os) => {
                const percentage = totalOsClicks > 0 ? (os.count / totalOsClicks) * 100 : 0;

                return (
                  <div
                    key={os.os}
                    className="rounded-xl border border-white/5 bg-black/20 p-3"
                  >
                    <div className="text-xs text-ghoste-grey">{os.os}</div>
                    <div className="text-lg text-ghoste-white font-semibold mt-1">
                      {percentage.toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-ghoste-grey/60">{os.count} clicks</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* New vs Returning */}
        {newVsReturning && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-ghoste-blue" />
              <h4 className="text-sm font-semibold text-ghoste-white">Sessions</h4>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3">
                <div className="text-xs text-green-300">New</div>
                <div className="text-2xl text-green-100 font-bold mt-1">
                  {newVsReturning.new}
                </div>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
                <div className="text-xs text-blue-300">Returning</div>
                <div className="text-2xl text-blue-100 font-bold mt-1">
                  {newVsReturning.returning}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Geo unavailable message */}
        {topCountries.length === 0 && topCities.length === 0 && (
          <div className="text-xs text-ghoste-grey/70 p-3 rounded-xl bg-black/20 border border-white/5">
            Geo data coming soon — enable IP capture for location tracking
          </div>
        )}
      </div>
    </div>
  );
}
