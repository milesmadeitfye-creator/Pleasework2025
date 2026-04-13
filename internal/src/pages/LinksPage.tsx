import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Link2,
  MousePointerClick,
  TrendingUp,
  Loader2,
} from 'lucide-react';

interface TopLink {
  id: string;
  slug: string;
  title: string;
  total_clicks: number;
  total_views: number;
}

interface DailyClick {
  date: string;
  clicks: number;
}

interface LinksData {
  totalLinks: number;
  activeLinks: number;
  totalOneClickLinks: number;
  totalClicks: number;
  clicksByPlatform: {
    ios: number;
    android: number;
    web: number;
    desktop: number;
    other: number;
  };
  topLinks: TopLink[];
  dailyClicks: DailyClick[];
}

export default function LinksPage() {
  const [data, setData] = useState<LinksData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api<LinksData>('/.netlify/functions/admin-links');
        setData(res);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load links data.'
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
            Loading links data...
          </div>
        </div>
      </div>
    );
  }

  const maxClicks =
    (data?.dailyClicks ?? []).length > 0
      ? Math.max(...(data?.dailyClicks ?? []).map((d) => d.clicks))
      : 1;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Link Control</h1>
        <p className="text-xs text-fg-mute">
          Link statistics, performance, and platform breakdown.
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
            <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <Link2 className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Total Links</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-fg">
                {(data?.totalLinks ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Active Links</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-ok">
                {(data?.activeLinks ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <Link2 className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">One-Click Links</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-brand-500">
                {(data?.totalOneClickLinks ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <MousePointerClick className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Total Clicks</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-brand-500">
                {formatNumber((data?.totalClicks ?? 0))}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Top Links</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Slug
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Title
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Clicks
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Views
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {((data?.topLinks ?? []).length > 0) ? (
                    (data?.topLinks ?? []).slice(0, 20).map((link) => (
                      <tr key={link?.id} className="border-b border-line/50">
                        <td className="py-2 px-3 font-mono text-sm text-brand-500">
                          {link?.slug ?? '—'}
                        </td>
                        <td className="py-2 px-3 text-fg">{link?.title ?? '—'}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-fg">
                          {formatNumber((link?.total_clicks ?? 0))}
                        </td>
                        <td className="py-2 px-3 font-mono text-fg-soft">
                          {formatNumber((link?.total_views ?? 0))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-fg-mute">
                        No links yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Daily Clicks (Last 30 Days)</h2>
            <div className="flex items-end gap-1 h-32 bg-ink-2 rounded p-4 border border-line/50">
              {(data?.dailyClicks ?? []).map((day, idx) => (
                <div
                  key={idx}
                  className="flex-1 bg-brand-600 rounded-t hover:bg-brand-500 transition-colors relative group"
                  style={{
                    height: `${(day.clicks / maxClicks) * 100}%`,
                    minHeight: '2px',
                  }}
                  title={`${day.date}: ${day.clicks} clicks`}
                >
                  <div className="hidden group-hover:block absolute bottom-full mb-1 bg-ink-0 border border-line rounded px-2 py-1 text-xs text-fg whitespace-nowrap">
                    {day.date}: {day.clicks}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Clicks by Platform</h2>
            <div className="space-y-3">
              {['ios', 'android', 'web', 'desktop', 'other'].map((platform) => {
                const count =
                  (data?.clicksByPlatform as any)?.[platform] ?? 0;
                const total =
                  ((data?.clicksByPlatform?.ios ?? 0) +
                    (data?.clicksByPlatform?.android ?? 0) +
                    (data?.clicksByPlatform?.web ?? 0) +
                    (data?.clicksByPlatform?.desktop ?? 0) +
                    (data?.clicksByPlatform?.other ?? 0)) || 1;
                const percent = ((count / total) * 100).toFixed(1);

                const colorMap = {
                  ios: 'bg-brand-600',
                  android: 'bg-blue-500',
                  web: 'bg-blue-400',
                  desktop: 'bg-purple-500',
                  other: 'bg-fg-mute',
                };
                const color =
                  colorMap[platform as keyof typeof colorMap];

                return (
                  <div key={platform}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-fg-soft capitalize">{platform}</span>
                      <span className="font-mono text-fg">
                        {formatNumber(count)} ({percent}%)
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
