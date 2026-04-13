import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Smartphone,
  Monitor,
  Users,
  MousePointerClick,
} from 'lucide-react';

interface DailyActivity {
  date: string;
  ios: number;
  android: number;
  web: number;
}

interface PlatformStats {
  platform: 'ios' | 'android' | 'web';
  users: number;
  clicks: number;
  activeUsers24h: number;
}

interface PlatformStatsData {
  ok: true;
  platformStats: {
    ios: PlatformStats;
    android: PlatformStats;
    web: PlatformStats;
  };
  dailyActivity: DailyActivity[];
}

export default function PlatformStatsPage() {
  const [data, setData] = useState<PlatformStatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api<PlatformStatsData>('/.netlify/functions/admin-platform-stats');
        setData(res);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load platform stats.');
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
          Loading platform stats...
        </div>
      </div>
    );
  }

  const maxDaily = (data?.dailyActivity?.length ?? 0) > 0
    ? Math.max(...(data?.dailyActivity ?? []).map(d => Math.max(d.ios, d.android, d.web)))
    : 1;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Cross-Platform Statistics</h1>
        <p className="text-xs text-fg-mute">
          iOS, Android, and Web usage and engagement metrics.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-line bg-ink-1 p-4 text-sm text-err flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {data && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PlatformCard
              title="iOS"
              icon={Smartphone}
              color="bg-brand-600"
              stats={data.platformStats.ios}
            />
            <PlatformCard
              title="Android"
              icon={Smartphone}
              color="bg-blue-500"
              stats={data.platformStats.android}
            />
            <PlatformCard
              title="Web"
              icon={Monitor}
              color="bg-blue-400"
              stats={data.platformStats.web}
            />
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Daily Activity Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Date</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">iOS</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Android</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Web</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dailyActivity.length > 0 ? (
                    data.dailyActivity.map((day) => (
                      <tr key={day.date} className="border-b border-line/50 hover:bg-ink-2/50">
                        <td className="py-2 px-3 text-xs text-fg-mute">
                          {new Date(day.date).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-3 font-mono text-fg">{formatNumber(day.ios)}</td>
                        <td className="py-2 px-3 font-mono text-fg">{formatNumber(day.android)}</td>
                        <td className="py-2 px-3 font-mono text-fg">{formatNumber(day.web)}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-fg">
                          {formatNumber(day.ios + day.android + day.web)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-fg-mute">
                        No activity data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Daily Trend by Platform</h2>
            <div className="space-y-6">
              {['ios', 'android', 'web'].map((platform) => {
                const color = platform === 'ios' ? 'bg-brand-600' : platform === 'android' ? 'bg-blue-500' : 'bg-blue-400';
                const label = platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Web';
                return (
                  <div key={platform}>
                    <p className="text-xs font-medium text-fg-mute uppercase tracking-wider mb-2">{label}</p>
                    <div className="flex items-end gap-1 h-24 bg-ink-2 rounded p-3 border border-line/50">
                      {data.dailyActivity.map((day, idx) => {
                        const value = platform === 'ios' ? day.ios : platform === 'android' ? day.android : day.web;
                        return (
                          <div
                            key={idx}
                            className={`flex-1 ${color} rounded-t hover:opacity-80 transition-opacity relative group`}
                            style={{
                              height: `${(value / maxDaily) * 100}%`,
                              minHeight: '2px',
                            }}
                            title={`${new Date(day.date).toLocaleDateString()}: ${value}`}
                          >
                            <div className="hidden group-hover:block absolute bottom-full mb-1 bg-ink-0 border border-line rounded px-2 py-1 text-xs text-fg whitespace-nowrap">
                              {formatNumber(value)}
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

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Platform Distribution</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: 'Total Users', key: 'users', stat: data.platformStats },
                { label: 'Total Clicks', key: 'clicks', stat: data.platformStats },
              ].map((section) => (
                <div key={section.label}>
                  <p className="text-xs text-fg-mute uppercase tracking-wider mb-3">{section.label}</p>
                  <div className="space-y-2">
                    {['ios', 'android', 'web'].map((platform) => {
                      const value = section.stat[platform as keyof typeof section.stat][section.key as any];
                      const total =
                        section.stat.ios[section.key as any] +
                        section.stat.android[section.key as any] +
                        section.stat.web[section.key as any];
                      const percent = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                      const color = platform === 'ios' ? 'bg-brand-600' : platform === 'android' ? 'bg-blue-500' : 'bg-blue-400';
                      const label = platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Web';

                      return (
                        <div key={platform}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-fg-soft">{label}</span>
                            <span className="font-mono text-fg">{percent}%</span>
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
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function PlatformCard({
  title,
  icon: Icon,
  color,
  stats,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  stats: PlatformStats;
}) {
  return (
    <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
      <div className="flex items-center gap-2 mb-4">
        <div className={`${color} h-3 w-3 rounded`} />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-4">
        <div>
          <p className="text-xs text-fg-mute uppercase tracking-wider">Users</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-fg">
            {formatNumber(stats.users)}
          </p>
        </div>
        <div>
          <p className="text-xs text-fg-mute uppercase tracking-wider">Clicks</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-fg">
            {formatNumber(stats.clicks)}
          </p>
        </div>
        <div>
          <p className="text-xs text-fg-mute uppercase tracking-wider">Active (24h)</p>
          <p className="mt-2 font-mono text-lg font-semibold text-ok">
            {formatNumber(stats.activeUsers24h)}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  return Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toLocaleString();
}
