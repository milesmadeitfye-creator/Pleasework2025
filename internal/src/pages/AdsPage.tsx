import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Megaphone,
  Play,
  Pause,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface RecentCampaign {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  objective: string;
  status: string;
}

interface AdsData {
  totalCampaigns: number;
  metaCampaigns: {
    statusCounts: {
      active: number;
      paused: number;
      completed: number;
    };
    objectiveCounts: Record<string, number>;
    recentCampaigns: RecentCampaign[];
  };
  adCampaigns: {
    statusCounts: Record<string, number>;
    recentCampaigns: RecentCampaign[];
  };
}

export default function AdsPage() {
  const [data, setData] = useState<AdsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api<AdsData>('/.netlify/functions/admin-ads');
        setData(res);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load ads data.');
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
            Loading ads data...
          </div>
        </div>
      </div>
    );
  }

  const campaigns = (data?.metaCampaigns?.recentCampaigns ?? []).filter((c) => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Meta Ads Control</h1>
        <p className="text-xs text-fg-mute">
          Campaign status, performance, and objective distribution.
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
            <h2 className="text-sm font-semibold mb-4">Campaign Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">
                  Total Campaigns
                </p>
                <p className="mt-2 font-mono text-3xl font-semibold text-fg">
                  {(data?.totalCampaigns ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-ink-2 rounded border border-line/50">
                  <p className="text-xs text-fg-mute uppercase tracking-wider">Active</p>
                  <p className="mt-1 font-mono text-xl font-semibold text-ok">
                    {(data?.metaCampaigns?.statusCounts?.active ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-3 bg-ink-2 rounded border border-line/50">
                  <p className="text-xs text-fg-mute uppercase tracking-wider">Paused</p>
                  <p className="mt-1 font-mono text-xl font-semibold text-warn">
                    {(data?.metaCampaigns?.statusCounts?.paused ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-3 bg-ink-2 rounded border border-line/50">
                  <p className="text-xs text-fg-mute uppercase tracking-wider">
                    Completed
                  </p>
                  <p className="mt-1 font-mono text-xl font-semibold text-fg-soft">
                    {(data?.metaCampaigns?.statusCounts?.completed ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Objective Distribution</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(data?.metaCampaigns?.objectiveCounts ?? {}).map(
                ([objective, count]) => (
                  <div
                    key={objective}
                    className="p-3 bg-ink-2 rounded border border-line/50"
                  >
                    <p className="text-xs text-fg-mute uppercase tracking-wider">
                      {objective}
                    </p>
                    <p className="mt-2 font-mono text-lg font-semibold text-fg">
                      {(count ?? 0).toLocaleString()}
                    </p>
                  </div>
                )
              )}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Recent Campaigns</h2>
              <div className="flex gap-2">
                {['all', 'active', 'paused', 'completed'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      filter === f
                        ? 'border-brand-600 bg-brand-600/10 text-brand-500'
                        : 'border-line/50 text-fg-mute hover:text-fg'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Name
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      User
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Objective
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(campaigns?.length ?? 0) > 0 ? (
                    campaigns.map((campaign) => (
                      <tr key={campaign?.id} className="border-b border-line/50">
                        <td className="py-2 px-3 font-medium text-fg">
                          {campaign?.name ?? '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-fg-soft">
                          {(campaign?.user_id ?? '').slice(0, 8)}...
                        </td>
                        <td className="py-2 px-3 text-xs text-fg-soft">
                          {campaign?.objective ?? '—'}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded ${
                              campaign?.status === 'active'
                                ? 'text-ok bg-ok/10'
                                : campaign?.status === 'paused'
                                  ? 'text-warn bg-warn/10'
                                  : campaign?.status === 'completed'
                                    ? 'text-fg-soft bg-fg-soft/10'
                                    : 'text-fg-mute bg-fg-mute/10'
                            }`}
                          >
                            {(campaign?.status ?? 'unknown').charAt(0).toUpperCase() +
                              (campaign?.status ?? 'unknown').slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-6 text-center text-xs text-fg-mute"
                      >
                        No campaigns found.
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
