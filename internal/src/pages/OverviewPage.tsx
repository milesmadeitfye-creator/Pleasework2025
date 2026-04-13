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
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

interface BillingData {
  ok: true;
  mrr: number;
  creditsOutstanding: number;
  creditsUsed: number;
  platformBreakdown: {
    ios: number;
    android: number;
    web: number;
  };
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  errors24h: number;
  warnings24h: number;
  lastCheck: string;
}

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
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const overview = await api<OverviewData>('/.netlify/functions/admin-overview');
        if (!cancelled) {
          setData(overview);
          setSystemHealth({
            status: overview.health === 'green' ? 'healthy' : overview.health === 'yellow' ? 'degraded' : 'critical',
            errors24h: overview.metrics?.errors24h ?? 0,
            warnings24h: 0,
            lastCheck: new Date().toISOString(),
          });
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed.');
      }
      // Billing is best-effort — don't crash if it fails
      try {
        const billing = await api<BillingData>('/.netlify/functions/admin-billing');
        if (!cancelled) setBillingData(billing);
      } catch {
        // billing data unavailable, continue without it
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

      {billingData && (
        <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card space-y-4">
          <h2 className="text-sm font-semibold">Live P&L Position</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-fg-mute uppercase tracking-wider">Estimated MRR</p>
              <p className="mt-2 font-mono text-lg font-semibold text-fg">
                ${formatNumber(billingData.mrr ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-fg-mute uppercase tracking-wider">Credits Outstanding</p>
              <p className="mt-2 font-mono text-lg font-semibold text-err">
                {formatNumber(billingData.creditsOutstanding ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-fg-mute uppercase tracking-wider">Credits Used (Revenue)</p>
              <p className="mt-2 font-mono text-lg font-semibold text-ok">
                {formatNumber(billingData.creditsUsed ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-fg-mute uppercase tracking-wider">Net Position</p>
              <p className={`mt-2 font-mono text-lg font-semibold ${
                (billingData.mrr ?? 0) >= 0 ? 'text-ok' : 'text-err'
              }`}>
                ${formatNumber((billingData.mrr ?? 0) - (billingData.creditsOutstanding ?? 0))}
              </p>
            </div>
          </div>
          {billingData.platformBreakdown && (billingData.platformBreakdown.ios > 0 || billingData.platformBreakdown.android > 0 || billingData.platformBreakdown.web > 0) && (
            <div className="mt-4 pt-4 border-t border-line">
              <p className="text-xs text-fg-mute uppercase tracking-wider mb-3">Platform Breakdown</p>
              <div className="flex gap-2 h-8">
                <div
                  className="bg-brand-600 rounded"
                  style={{width: `${billingData.platformBreakdown.ios}%`}}
                  title="iOS"
                />
                <div
                  className="bg-blue-500 rounded"
                  style={{width: `${billingData.platformBreakdown.android}%`}}
                  title="Android"
                />
                <div
                  className="bg-blue-400 rounded"
                  style={{width: `${billingData.platformBreakdown.web}%`}}
                  title="Web"
                />
              </div>
              <div className="flex gap-4 text-xs mt-2">
                <span>iOS: {billingData.platformBreakdown.ios}%</span>
                <span>Android: {billingData.platformBreakdown.android}%</span>
                <span>Web: {billingData.platformBreakdown.web}%</span>
              </div>
            </div>
          )}
        </section>
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
          accent={(data?.metrics.errors24h ?? 0) > 0 ? 'warn' : undefined}
        />
      </section>

      {systemHealth && (
        <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">System Health</h2>
            <span className={`text-xs font-medium px-2 py-1 rounded ${
              systemHealth.status === 'healthy' ? 'text-ok bg-ok/10' :
              systemHealth.status === 'degraded' ? 'text-warn bg-warn/10' :
              'text-err bg-err/10'
            }`}>
              {systemHealth.status.charAt(0).toUpperCase() + systemHealth.status.slice(1)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-fg-mute">Errors (24h)</p>
              <p className="mt-1 font-mono text-lg font-semibold text-err">
                {systemHealth.errors24h}
              </p>
            </div>
            <div>
              <p className="text-xs text-fg-mute">Last Check</p>
              <p className="mt-1 font-mono text-xs text-fg-soft">
                {relTime(systemHealth.lastCheck)}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="text-sm font-medium">Recent admin activity</h2>
          <span className="text-[11px] text-fg-mute">
            {data?.activity?.length ?? 0} events
          </span>
        </div>
        <div className="divide-y divide-line-soft">
          {data?.activity?.length ? (
            data?.activity?.map((a) => (
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

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0';
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
