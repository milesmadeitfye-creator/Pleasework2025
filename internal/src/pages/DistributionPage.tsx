import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Music,
  Send,
  CheckCircle2,
  Clock,
} from 'lucide-react';

interface Release {
  id: string;
  title: string;
  artist: string;
  status: 'draft' | 'submitted' | 'live' | 'rejected' | 'archived';
  releaseDate: string;
  isrc: string;
  upc: string;
  createdAt: string;
}

interface DistributionData {
  ok: true;
  releaseStats: {
    draft: number;
    submitted: number;
    live: number;
    rejected: number;
    archived: number;
  };
  releases: Release[];
  payoutSummary: {
    totalPayouts: number;
    pendingPayouts: number;
    lastPayoutDate: string | null;
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
        const res = await api<DistributionData>('/.netlify/functions/admin-distribution');
        setData(res);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load distribution data.');
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
          Loading distribution data...
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
          <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-lg border border-line bg-ink-1 p-4 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <Music className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Draft</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-fg-soft">
                {data.releaseStats.draft}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-4 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <Clock className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Submitted</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-warn">
                {data.releaseStats.submitted}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-4 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Live</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-ok">
                {data.releaseStats.live}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-4 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Rejected</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-err">
                {data.releaseStats.rejected}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-4 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <Send className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Archived</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-fg-mute">
                {data.releaseStats.archived}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Payout Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Total Payouts</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-fg">
                  ${formatNumber(data.payoutSummary.totalPayouts)}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Pending Payouts</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-warn">
                  ${formatNumber(data.payoutSummary.pendingPayouts)}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Last Payout</p>
                <p className="mt-2 text-sm text-fg-soft">
                  {data.payoutSummary.lastPayoutDate
                    ? new Date(data.payoutSummary.lastPayoutDate).toLocaleDateString()
                    : 'Never'}
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
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Title</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Artist</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Status</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Release Date</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">ISRC</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">UPC</th>
                  </tr>
                </thead>
                <tbody>
                  {data.releases.length > 0 ? (
                    data.releases.map((release) => (
                      <tr key={release.id} className="border-b border-line/50 hover:bg-ink-2/50">
                        <td className="py-2 px-3 font-medium text-fg">{release.title}</td>
                        <td className="py-2 px-3 text-fg-soft">{release.artist}</td>
                        <td className="py-2 px-3">
                          <span className={`text-xs font-medium px-2 py-1 rounded ${
                            release.status === 'live' ? 'text-ok bg-ok/10' :
                            release.status === 'submitted' ? 'text-warn bg-warn/10' :
                            release.status === 'draft' ? 'text-fg-soft bg-fg-soft/10' :
                            release.status === 'rejected' ? 'text-err bg-err/10' :
                            'text-fg-mute bg-fg-mute/10'
                          }`}>
                            {release.status.charAt(0).toUpperCase() + release.status.slice(1)}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-xs text-fg-mute">
                          {new Date(release.releaseDate).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-fg-soft">{release.isrc}</td>
                        <td className="py-2 px-3 font-mono text-xs text-fg-soft">{release.upc}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-xs text-fg-mute">
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
  return Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toLocaleString();
}
