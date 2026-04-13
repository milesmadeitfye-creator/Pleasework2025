import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  DollarSign,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

interface CreditTransaction {
  id: string;
  transactionType: 'dispensed' | 'used' | 'refund';
  amount: number;
  userId: string | null;
  createdAt: string;
}

interface WalletTransaction {
  id: string;
  walletId: string;
  amount: number;
  type: 'credit' | 'debit';
  createdAt: string;
}

interface SubscriptionBreakdown {
  free: number;
  pro: number;
  enterprise: number;
}

interface PlatformRevenue {
  web: number;
  ios: number;
  android: number;
}

interface BillingPageData {
  ok: true;
  pnl: {
    mrr: number;
    costCreditsDispensed: number;
    costInfrastructure: number;
    profit: number;
    marginPercent: number;
  };
  subscriptionBreakdown: SubscriptionBreakdown;
  creditTransactions: CreditTransaction[];
  walletTransactions: WalletTransaction[];
  creditsUsedTotal: number;
  revenueGenerated: number;
  stripeOverview: {
    completedCheckouts: number;
    pendingCheckouts: number;
    connectedAccounts: number;
  };
  platformRevenue: PlatformRevenue;
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
          Loading billing data...
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
                <p className="text-xs text-fg-mute uppercase tracking-wider">Revenue (MRR)</p>
                <p className="mt-2 font-mono text-lg font-semibold text-ok">
                  ${formatNumber(data.pnl.mrr)}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Cost (Credits)</p>
                <p className="mt-2 font-mono text-lg font-semibold text-err">
                  ${formatNumber(data.pnl.costCreditsDispensed)}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Cost (Infrastructure)</p>
                <p className="mt-2 font-mono text-lg font-semibold text-err">
                  ${formatNumber(data.pnl.costInfrastructure)}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Profit Margin</p>
                <p className={`mt-2 font-mono text-lg font-semibold ${
                  data.pnl.marginPercent >= 0 ? 'text-ok' : 'text-err'
                }`}>
                  {data.pnl.marginPercent.toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-line">
              <p className="text-xs text-fg-mute uppercase tracking-wider mb-2">Net Profit</p>
              <p className={`font-mono text-2xl font-semibold ${
                data.pnl.profit >= 0 ? 'text-ok' : 'text-err'
              }`}>
                ${formatNumber(data.pnl.profit)}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Subscription Breakdown</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-ink-2 rounded border border-line/50">
                <p className="text-xs text-fg-mute uppercase tracking-wider">Free</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-fg">
                  {data.subscriptionBreakdown.free}
                </p>
              </div>
              <div className="text-center p-4 bg-ink-2 rounded border border-line/50">
                <p className="text-xs text-fg-mute uppercase tracking-wider">Pro</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-brand-500">
                  {data.subscriptionBreakdown.pro}
                </p>
              </div>
              <div className="text-center p-4 bg-ink-2 rounded border border-line/50">
                <p className="text-xs text-fg-mute uppercase tracking-wider">Enterprise</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-ok">
                  {data.subscriptionBreakdown.enterprise}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Usage vs Profit</h2>
            <div className="flex gap-6">
              <div className="flex-1">
                <div className="flex items-end gap-2 h-32 bg-ink-2 rounded p-4 border border-line/50">
                  <div
                    className="flex-1 bg-warn rounded-t"
                    style={{
                      height: `${Math.min(100, (data.creditsUsedTotal / (data.revenueGenerated || 1)) * 100)}%`
                    }}
                    title="Credits Used"
                  />
                  <div
                    className="flex-1 bg-ok rounded-t"
                    style={{
                      height: `${Math.min(100, (data.revenueGenerated / (data.creditsUsedTotal || 1)) * 100)}%`
                    }}
                    title="Revenue Generated"
                  />
                </div>
                <div className="flex gap-4 text-xs mt-2">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded bg-warn" />
                    <span>Credits: {formatNumber(data.creditsUsedTotal)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded bg-ok" />
                    <span>Revenue: ${formatNumber(data.revenueGenerated)}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Stripe Overview</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Completed Checkouts</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-ok">
                  {data.stripeOverview.completedCheckouts}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Pending Checkouts</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-warn">
                  {data.stripeOverview.pendingCheckouts}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-mute uppercase tracking-wider">Connected Accounts</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-fg">
                  {data.stripeOverview.connectedAccounts}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Platform Revenue Split</h2>
            <div className="flex gap-2 h-8 rounded overflow-hidden">
              <div
                className="bg-brand-600"
                style={{width: `${data.platformRevenue.ios}%`}}
                title={`iOS: ${data.platformRevenue.ios}%`}
              />
              <div
                className="bg-blue-500"
                style={{width: `${data.platformRevenue.android}%`}}
                title={`Android: ${data.platformRevenue.android}%`}
              />
              <div
                className="bg-blue-400"
                style={{width: `${data.platformRevenue.web}%`}}
                title={`Web: ${data.platformRevenue.web}%`}
              />
            </div>
            <div className="flex gap-4 text-xs mt-3">
              <span>iOS: {data.platformRevenue.ios}%</span>
              <span>Android: {data.platformRevenue.android}%</span>
              <span>Web: {data.platformRevenue.web}%</span>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Recent Transactions</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Type</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Amount</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">User ID</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.creditTransactions.slice(0, 10).map((tx) => (
                    <tr key={tx.id} className="border-b border-line/50">
                      <td className="py-2 px-3 text-fg-soft capitalize">{tx.transactionType}</td>
                      <td className="py-2 px-3 font-mono text-fg">{formatNumber(tx.amount)}</td>
                      <td className="py-2 px-3 font-mono text-xs text-fg-mute">
                        {tx.userId ? tx.userId.slice(0, 8) + '...' : '—'}
                      </td>
                      <td className="py-2 px-3 text-xs text-fg-soft">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
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
