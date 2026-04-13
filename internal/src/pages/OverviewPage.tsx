import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Link2,
  Megaphone,
  MousePointerClick,
  Users,
  Zap,
} from 'lucide-react';

interface OverviewData {
  ok: true;
  metrics: {
    totalUsers: number | null;
    activeUsers24h: number | null;
    proUsers: number | null;
    runningCampaigns: number | null;
    linksCreated: number | null;
    clicks24h: number | null;
    errors24h: number | null;
    creditsBalance: number | null;
    creditsMonthlyLimit: number | null;
  };
  health: 'green' | 'yellow' | 'red';
  activity: Array<{
    id: string;
    actor_email: string;
    action: string;
    target_email: string | null;
    created_at: string;
    payload: Record<string, unknown>;
  }>;
  generatedAt: string;
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api<OverviewData>('/.netlify/functions/admin-overview');
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed.');
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Company Overview</h1>
          <p className="text-xs text-fg-mute">
            Real-time snapshot across users, ads, links, credits & system health.
          </p>
        </div>
        {data && <HealthBadge level={data.health} />}
      </header>

      {error && (
        <div className="card p-4 text-sm text-err flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric icon={Users} label="Total users" value={data?.metrics.totalUsers} />
        <Metric icon={Activity} label="Active (24h)" value={data?.metrics.activeUsers24h} />
        <Metric icon={Zap} label="Pro users" value={data?.metrics.proUsers} />
        <Metric
          icon={Megaphone}
          label="Campaigns running"
          value={data?.metrics.runningCampaigns}
        />
        <Metric icon={Link2} label="Links created" value={data?.metrics.linksCreated} />
        <Metric
          icon={MousePointerClick}
          label="Clicks (24h)"
          value={data?.metrics.clicks24h}
        />
        <Metric
          icon={CreditCard}
          label="Credits outstanding"
          value={data?.metrics.creditsBalance}
          formatter={formatNumber}
        />
        <Metric
          icon={AlertTriangle}
          label="Errors (24h)"
          value={data?.metrics.errors24h}
          accent={data?.metrics.errors24h && data.metrics.errors24h > 0 ? 'warn' : undefined}
        />
      </section>

      <section className="card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="text-sm font-medium">Recent admin activity</h2>
          <span className="text-[11px] text-fg-mute">
            {data?.activity?.length ?? 0} events
          </span>
        </div>
        <div className="divide-y divide-line-soft">
          {data?.activity?.length ? (
            data.activity.map((a) => (
              <div key={a.id} className="flex items-start justify-between px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-fg">{a.actor_email}</span>
                    <span className="text-fg-mute">·</span>
                    <span className="text-fg-soft">{a.action}</span>
                    {a.target_email && (
                      <>
                        <span className="text-fg-mute">→</span>
                        <span className="font-mono text-xs text-fg-soft">{a.target_email}</span>
                      </>
                    )}
                  </div>
                </div>
                <time className="text-[11px] text-fg-mute whitespace-nowrap ml-4">
                  {relTime(a.created_at)}
                </time>
              </div>
            ))
          ) : (
            <div className="px-4 py-6 text-center text-xs text-fg-mute">
              No admin activity yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  formatter,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null | undefined;
  formatter?: (n: number) => string;
  accent?: 'warn' | 'err';
}) {
  const v =
    value == null
      ? '—'
      : formatter
        ? formatter(value)
        : value.toLocaleString();
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-fg-mute text-[11px]">
        <Icon className="h-3.5 w-3.5" />
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      <div
        className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
          accent === 'warn' ? 'text-warn' : accent === 'err' ? 'text-err' : 'text-fg'
        }`}
      >
        {v}
      </div>
    </div>
  );
}

function HealthBadge({ level }: { level: 'green' | 'yellow' | 'red' }) {
  const cfg = {
    green: { cls: 'text-ok border-ok/40 bg-ok/10', icon: CheckCircle2, label: 'All systems nominal' },
    yellow: { cls: 'text-warn border-warn/40 bg-warn/10', icon: AlertTriangle, label: 'Degraded' },
    red: { cls: 'text-err border-err/40 bg-err/10', icon: AlertTriangle, label: 'Critical' },
  }[level];
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${cfg.cls}`}
    >
      <cfg.icon className="h-3.5 w-3.5" />
      {cfg.label}
    </div>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString();
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
