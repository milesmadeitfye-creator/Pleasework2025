import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Loader2,
} from 'lucide-react';

interface RecentTransaction {
  transaction_id: string;
  user_id: string;
  budget_type: string;
  credit_change: number;
  action_type: string;
  created_at: string;
}

interface BillingPageData {
  totalUsers: number;
  proUsers: number;
  freeUsers: number;
  mrr: number;
  creditsOutstanding: number;
  creditsUsedTotal: number;
  stripeCheckouts: {
    completed: number;
    pending: number;
  };
  recentTransactions: RecentTransaction[];
  platformBreakdown: {
    web: number;
    ios: number;
    android: number;
    other: number;
  };
}

export default function BillingPage() {
  const [data, setData] = useState<BillingPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api<BillingPageData>('/.netlify/functions/admin-billing');
        setData(res);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load billing data.');
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
            Loading billing data...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Billing & Credits</h1>
        <p className="text-xs text-fg-mute">
          P&L statement, subscriptions, credit ledger, and revenue breakdown.
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
            <h2 className="text-sm font-semibold mb-4">P&L Statement</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Monthly Recurring Revenue</p>
                <p className="mt-2 font-mono text-lg font-semibold text-ok">
                  ${formatNumber((data?.mrr ?? 0))}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Credits Outstanding</p>
                <p className="mt-2 font-mono text-lg font-semibold text-warn">
                  ${formatNumber((data?.creditsOutstanding ?? 0))}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Credits Used (Total)</p>
                <p className="mt-2 font-mono text-lg font-semibold text-fg-soft">
                  ${formatNumber((data?.creditsUsedTotal ?? 0))}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Net</p>
                <p className="mt-2 font-mono text-lg font-semibold text-ok">
                  ${formatNumber(
                    (data?.mrr ?? 0) - (data?.creditsOutstanding ?? 0)
                  )}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Subscription Breakdown</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-ink-2 rounded border border-line/50">
                <p className="text-xs text-fg-mute uppercase tracking-wider">Pro Users</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-brand-500">
                  {(data?.proUsers ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-fg-mute mt-1">
                  {data?.proUsers && data?.totalUsers
                    ? ((data.proUsers / data.totalUsers) * 100).toFixed(1)
                    : '0'}
                  %
                </p>
              </div>
              <div className="text-center p-4 bg-ink-2 rounded border border-line/50">
                <p className="text-xs text-fg-mute uppercase tracking-wider">Free Users</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-fg">
                  {(data?.freeUsers ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-fg-mute mt-1">
                  {data?.freeUsers && data?.totalUsers
                    ? ((data.freeUsers / data.totalUsers) * 100).toFixed(1)
                    : '0'}
                  %
                </p>
              </div>
              <div className="text-center p-4 bg-ink-2 rounded border border-line/50">
                <p className="text-xs text-fg-mute uppercase tracking-wider">Total Users</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-fg-soft">
                  {(data?.totalUsers ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Stripe Checkout Status</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Completed</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-ok">
                  {(data?.stripeCheckouts?.completed ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Pending</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-warn">
                  {(data?.stripeCheckouts?.pending ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Platform Revenue Breakdown</h2>
            <div className="space-y-3">
              {['web', 'ios', 'android', 'other'].map((platform) => {
                const value = (data?.platformBreakdown as any)?.[platform] ?? 0;
                const total = ((data?.platformBreakdown?.web ?? 0) +
                  (data?.platformBreakdown?.ios ?? 0) +
                  (data?.platformBreakdown?.android ?? 0) +
                  (data?.platformBreakdown?.other ?? 0)) || 1;
                const percent = ((value / total) * 100).toFixed(1);
                const colorMap = {
                  web: 'bg-blue-400',
                  ios: 'bg-brand-600',
                  android: 'bg-blue-500',
                  other: 'bg-fg-mute',
                };
                const color = colorMap[platform as keyof typeof colorMap];

                return (
                  <div key={platform}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-fg-soft capitalize">{platform}</span>
                      <span className="font-mono text-fg">${formatNumber(value)}</span>
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

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Recent Transactions</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Transaction ID
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      User ID
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Action Type
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Credit Change
                    </th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {((data?.recentTransactions ?? []).length > 0) ? (
                    (data?.recentTransactions ?? []).slice(0, 20).map((tx) => (
                      <tr key={tx.transaction_id} className="border-b border-line/50">
                        <td className="py-2 px-3 font-mono text-xs text-fg-soft">
                          {(tx?.transaction_id ?? '').slice(0, 8)}...
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-fg-soft">
                          {(tx?.user_id ?? '').slice(0, 8)}...
                        </td>
                        <td className="py-2 px-3 text-xs text-fg-soft capitalize">
                          {tx?.action_type ?? '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-fg">
                          {(tx?.credit_change ?? 0) > 0 ? '+' : ''}
                          {(tx?.credit_change ?? 0).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-xs text-fg-mute">
                          {new Date(tx?.created_at ?? '').toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-fg-mute">
                        No transactions yet.
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
