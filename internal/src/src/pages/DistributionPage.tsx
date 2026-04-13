import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Music,
  Send,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';

interface RecentRelease {
  id: string;
  user_id: string;
  title: string;
  artist_name: string;
  release_date: string;
  status: string;
  isrc: string;
  upc: string;
}

interface DistributionData {
  totalReleases: number;
  statusCounts: {
    draft: number;
    submitted: number;
    live: number;
  };
  recentReleases: RecentRelease[];
  payoutSummary: {
    totalPayouts: number;
    uniqueUsers: number;
    recentPayouts: any[];
  };
}

export default function DistributionPage() {
  const [data, setData] = useState<DistributionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api<DistributionData>(
          '/.netlify/functions/admin-distribution'
        );
        setData(res);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load distribution data.'
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
            Loading distribution data...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Distribution Control</h1>
        <p className="text-xs text-fg-mute">
          Release status, management, and payout summary.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-line bg-ink-1 p-4 text-sm text-err flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {data && (
        <>
          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Release Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">
                  Total Releases
                </p>
                <p className="mt-2 font-mono text-3xl font-semibold text-fg">
                  {(data?.totalReleases ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-ink-2 rounded border border-line/50">
                  <p className="text-xs text-fg-mute uppercase tracking-wider">Draft</p>
                  <p className="mt-1 font-mono text-xl font-semibold text-fg-soft">
                    {(data?.statusCounts?.draft ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-3 bg-ink-2 rounded border border-line/50">
                  <p className="text-xs text-fg-mute uppercase tracking-wider">
                    Submitted
                  </p>
                  <p className="mt-1 font-mono text-xl font-semibold text-warn">
                    {(data?.statusCounts?.submitted ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-3 bg-ink-2 rounded border border-line/50">
                  <p className="text-xs text-fg-mute uppercase tracking-wider">Live</p>
                  <p className="mt-1 font-mono text-xl font-semibold text-ok">
                    {(data?.statusCounts?.live ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Payout Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">
                  Total Payouts
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-fg">
                  ${formatNumber((data?.payoutSummary?.totalPayouts ?? 0))}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">
                  Unique Users Paid
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-fg">
                  {(data?.payoutSummary?.uniqueUsers ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Releases</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Title
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Artist
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Release Date
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      ISRC
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      UPC
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {((data?.recentReleases ?? []).length > 0) ? (
                    (data?.recentReleases ?? []).slice(0, 20).map((release) => (
                      <tr key={release?.id} className="border-b border-line/50">
                        <td className="py-2 px-3 font-medium text-fg">
                          {release?.title ?? '—'}
                        </td>
                        <td className="py-2 px-3 text-fg-soft">
                          {release?.artist_name ?? '—'}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded ${
                              release?.status === 'live'
                                ? 'text-ok bg-ok/10'
                                : release?.status === 'submitted'
                                  ? 'text-warn bg-warn/10'
                                  : release?.status === 'draft'
                                    ? 'text-fg-soft bg-fg-soft/10'
                                    : 'text-fg-mute bg-fg-mute/10'
                            }`}
                          >
                            {(release?.status ?? 'unknown')
                              .charAt(0)
                              .toUpperCase() +
                              (release?.status ?? 'unknown').slice(1)}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-xs text-fg-mute">
                          {new Date(
                            release?.release_date ?? ''
                          ).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-fg-soft">
                          {release?.isrc ?? '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-fg-soft">
                          {release?.upc ?? '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-6 text-center text-xs text-fg-mute"
                      >
                        No releases found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
