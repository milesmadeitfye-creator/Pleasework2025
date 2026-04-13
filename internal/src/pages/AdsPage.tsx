import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Megaphone,
  Play,
  Pause,
  CheckCircle2,
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  userId: string;
  objective: string;
  status: 'active' | 'paused' | 'completed' | 'draft';
  createdAt: string;
  updatedAt: string;
}

interface AdsData {
  ok: true;
  campaignStats: {
    active: number;
    paused: number;
    completed: number;
    draft: number;
  };
  campaigns: Campaign[];
  objectiveDistribution: Record<string, number>;
  recentActivity: Array<{
    id: string;
    campaignId: string;
    action: string;
    timestamp: string;
  }>;
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

  const filteredCampaigns = data?.campaigns.filter((c) => {
    if (filter === 'all') return true;
    return c.status === filter;
  }) || [];

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="rounded-lg border border-line bg-ink-1 p-6 text-center text-sm text-fg-mute">
          Loading ads data...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Meta Ads Control Center</h1>
        <p className="text-xs text-fg-mute">
          Campaign status, management, and performance overview.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-line bg-ink-1 p-4 text-sm text-err flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {data && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-line bg-ink-1 p-4 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <Play className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Active</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-ok">
                {data.campaignStats.active}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-4 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <Pause className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Paused</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-warn">
                {data.campaignStats.paused}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-4 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Completed</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-fg">
                {data.campaignStats.completed}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-4 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <Megaphone className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Draft</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-fg-soft">
                {data.campaignStats.draft}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Objective Distribution</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(data.objectiveDistribution).map(([objective, count]) => (
                <div key={objective} className="p-3 bg-ink-2 rounded border border-line/50">
                  <p className="text-xs text-fg-mute uppercase tracking-wider">{objective}</p>
                  <p className="mt-2 font-mono text-lg font-semibold text-fg">{count}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Campaigns</h2>
              <div className="flex gap-2">
                {['all', 'active', 'paused', 'completed', 'draft'].map((f) => (
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
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Name</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">User</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Objective</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Status</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCampaigns.length > 0 ? (
                    filteredCampaigns.map((campaign) => (
                      <tr key={campaign.id} className="border-b border-line/50 hover:bg-ink-2/50">
                        <td className="py-2 px-3 font-medium text-fg">{campaign.name}</td>
                        <td className="py-2 px-3 font-mono text-xs text-fg-soft">
                          {campaign.userId.slice(0, 12)}...
                        </td>
                        <td className="py-2 px-3 text-fg-soft text-xs">{campaign.objective}</td>
                        <td className="py-2 px-3">
                          <span className={`text-xs font-medium px-2 py-1 rounded ${
                            campaign.status === 'active' ? 'text-ok bg-ok/10' :
                            campaign.status === 'paused' ? 'text-warn bg-warn/10' :
                            campaign.status === 'completed' ? 'text-fg-soft bg-fg-soft/10' :
                            'text-fg-mute bg-fg-mute/10'
                          }`}>
                            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-xs text-fg-mute">
                          {relTime(campaign.createdAt)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-fg-mute">
                        No campaigns found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {data.recentActivity.length > 0 && (
            <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <h2 className="text-sm font-semibold mb-4">Recent Activity</h2>
              <div className="space-y-2">
                {data.recentActivity.slice(0, 10).map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between text-sm p-2 bg-ink-2/50 rounded">
                    <div>
                      <p className="text-fg-soft">{activity.action}</p>
                      <p className="text-xs text-fg-mute">Campaign: {activity.campaignId.slice(0, 8)}...</p>
                    </div>
                    <span className="text-xs text-fg-mute">{relTime(activity.timestamp)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
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
