import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Smartphone,
  Monitor,
  Loader2,
} from 'lucide-react';

interface DailyBreakdown {
  date: string;
  ios: number;
  android: number;
  web: number;
  other: number;
}

interface PlatformStatsData {
  clicksByPlatform: {
    ios: number;
    android: number;
    web: number;
    other: number;
  };
  usersByPlatform: {
    ios: number;
    android: number;
    web: number;
    other: number;
  };
  activityByPlatform: {
    ios: number;
    android: number;
    web: number;
    other: number;
  };
  dailyBreakdown: DailyBreakdown[];
}

export default function PlatformStatsPage() {
  const [data, setData] = useState<PlatformStatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api<PlatformStatsData>(
          '/.netlify/functions/admin-platform-stats'
        );
        setData(res);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load platform stats.'
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="rounded-lg border border-line bg-ink-1 p-6 text-center text-sm text-fg-mute">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading platform stats...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          Cross-Platform Statistics
        </h1>
        <p className="text-xs text-fg-mute">
          iOS, Android, Web, and other platform usage metrics.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-line bg-ink-1 p-4 text-sm text-err flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {data && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {['ios', 'android', 'web', 'other'].map((platform) => {
              const clicks =
                (data?.clicksByPlatform as any)?.[platform] ?? 0;
              const users = (data?.usersByPlatform as any)?.[platform] ?? 0;
              const activity =
                (data?.activityByPlatform as any)?.[platform] ?? 0;

              const colorMap = {
                ios: 'bg-brand-600',
                android: 'bg-blue-500',
                web: 'bg-blue-400',
                other: 'bg-fg-mute',
              };
              const color = colorMap[platform as keyof typeof colorMap];

              const iconMap = {
                ios: Smartphone,
                android: Smartphone,
                web: Monitor,
                other: Monitor,
              };
              const Icon = iconMap[platform as keyof typeof iconMap];

              return (
                <div
                  key={platform}
                  className="rounded-lg border border-line bg-ink-1 p-6 shadow-card"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`${color} h-3 w-3 rounded`} />
                    <h3 className="text-sm font-semibold capitalize">
                      {platform}
                    </h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-fg-mute uppercase tracking-wider">
                        Clicks
                      </p>
                      <p className="mt-2 font-mono text-lg font-semibold text-fg">
                        {formatNumber(clicks)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-fg-mute uppercase tracking-wider">
                        Users
                      </p>
                      <p className="mt-2 font-mono text-lg font-semibold text-fg">
                        {formatNumber(users)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-fg-mute uppercase tracking-wider">
                        Activity
                      </p>
                      <p className="mt-2 font-mono text-lg font-semibold text-ok">
                        {formatNumber(activity)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Daily Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Date
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      iOS
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Android
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Web
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Other
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {((data?.dailyBreakdown ?? []).length > 0) ? (
                    (data?.dailyBreakdown ?? []).map((day) => (
                      <tr key={day?.date} className="border-b border-line/50">
                        <td className="py-2 px-3 text-xs text-fg-mute">
                          {new Date(day?.date ?? '').toLocaleDateString()}
                        </td>
                        <td className="py-2 px-3 font-mono text-fg">
                          {formatNumber((day?.ios ?? 0))}
                        </td>
                        <td className="py-2 px-3 font-mono text-fg">
                          {formatNumber((day?.android ?? 0))}
                        </td>
                        <td className="py-2 px-3 font-mono text-fg">
                          {formatNumber((day?.web ?? 0))}
                        </td>
                        <td className="py-2 px-3 font-mono text-fg">
                          {formatNumber((day?.other ?? 0))}
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold text-fg">
                          {formatNumber(
                            (day?.ios ?? 0) +
                              (day?.android ?? 0) +
                              (day?.web ?? 0) +
                              (day?.other ?? 0)
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-6 text-center text-xs text-fg-mute"
                      >
                        No activity data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Platform Distribution</h2>
            <div className="space-y-6">
              {[
                {
                  label: 'Clicks Distribution',
                  data: data?.clicksByPlatform,
                },
                {
                  label: 'Users Distribution',
                  data: data?.usersByPlatform,
                },
                {
                  label: 'Activity Distribution',
                  data: data?.activityByPlatform,
                },
              ].map((section) => {
                const total =
                  ((section?.data as any)?.ios ?? 0) +
                  ((section?.data as any)?.android ?? 0) +
                  ((section?.data as any)?.web ?? 0) +
                  ((section?.data as any)?.other ?? 0);

                return (
                  <div key={section.label}>
                    <p className="text-xs font-medium text-fg-mute uppercase tracking-wider mb-3">
                      {section.label}
                    </p>
                    <div className="space-y-2">
                      {['ios', 'android', 'web', 'other'].map((platform) => {
                        const value =
                          ((section?.data as any)?.[platform] ?? 0);
                        const percent =
                          total > 0
                            ? ((value / total) * 100).toFixed(1)
                            : '0';

                        const colorMap = {
                          ios: 'bg-brand-600',
                          android: 'bg-blue-500',
                          web: 'bg-blue-400',
                          other: 'bg-fg-mute',
                        };
                        const color =
                          colorMap[platform as keyof typeof colorMap];
                        const label =
                          platform === 'ios'
                            ? 'iOS'
                            : platform === 'android'
                              ? 'Android'
                              : platform === 'web'
                                ? 'Web'
                                : 'Other';

                        return (
                          <div key={platform}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-fg-soft">{label}</span>
                              <span className="font-mono text-fg">
                                {percent}%
                              </span>
                            </div>
                            <div className="w-full bg-ink-2 rounded h-2 overflow-hidden border border-line/50">
                              <div
                                className={`h-full ${color}`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  return Math.abs(n ?? 0) >= 1000
    ? ((n ?? 0) / 1000).toFixed(1) + 'k'
    : (n ?? 0).toLocaleString();
}
