import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Link2,
  MousePointerClick,
  TrendingUp,
} from 'lucide-react';

interface LinkItem {
  id: string;
  shortCode: string;
  title: string;
  clicks: number;
  createdAt: string;
}

interface DailyClicks {
  date: string;
  clicks: number;
}

interface PlatformBreakdown {
  ios: number;
  android: number;
  web: number;
}

interface LinksData {
  ok: true;
  totalLinks: number;
  activeLinks: number;
  totalClicks: number;
  topLinks: LinkItem[];
  dailyClicks: DailyClicks[];
  platformBreakdown: PlatformBreakdown;
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
        setError(err instanceof Error ? err.message : 'Failed to load links data.');
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
          Loading links data...
        </div>
      </div>
    );
  }

  const maxClicks = data && data.dailyClicks.length > 0
    ? Math.max(...data.dailyClicks.map(d => d.clicks))
    : 1;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Link Control System</h1>
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
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <Link2 className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Total Links</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-fg">
                {data.totalLinks}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Active Links</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-ok">
                {data.activeLinks}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <MousePointerClick className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Total Clicks</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-brand-500">
                {formatNumber(data.totalClicks)}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Top 10 Links</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Short Code</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Title</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Clicks</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topLinks.length > 0 ? (
                    data.topLinks.map((link) => (
                      <tr key={link.id} className="border-b border-line/50 hover:bg-ink-2/50">
                        <td className="py-2 px-3 font-mono text-sm text-brand-500">{link.shortCode}</td>
                        <td className="py-2 px-3 text-fg">{link.title}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-fg">{formatNumber(link.clicks)}</td>
                        <td className="py-2 px-3 text-xs text-fg-mute">
                          {relTime(link.createdAt)}
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
            <h2 className="text-sm font-semibold mb-4">Click Trend (Last 30 Days)</h2>
            <div className="flex items-end gap-1 h-32 bg-ink-2 rounded p-4 border border-line/50">
              {data.dailyClicks.map((day, idx) => (
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
            <p className="text-xs text-fg-mute mt-2">
              {data.dailyClicks.length} days shown, max: {maxClicks} clicks/day
            </p>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Platform Breakdown</h2>
            <div className="flex gap-2 h-8 rounded overflow-hidden">
              <div
                className="bg-brand-600"
                style={{width: `${data.platformBreakdown.ios}%`}}
                title={`iOS: ${data.platformBreakdown.ios}%`}
              />
              <div
                className="bg-blue-500"
                style={{width: `${data.platformBreakdown.android}%`}}
                title={`Android: ${data.platformBreakdown.android}%`}
              />
              <div
                className="bg-blue-400"
                style={{width: `${data.platformBreakdown.web}%`}}
                title={`Web: ${data.platformBreakdown.web}%`}
              />
            </div>
            <div className="flex gap-4 text-xs mt-3">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded bg-brand-600" />
                <span>iOS: {data.platformBreakdown.ios}%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded bg-blue-500" />
                <span>Android: {data.platformBreakdown.android}%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded bg-blue-400" />
                <span>Web: {data.platformBreakdown.web}%</span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  return Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toLocaleString();
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
