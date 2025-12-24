import { Coins, Zap } from 'lucide-react';
import { useCredits } from '../../hooks/useCredits';

export default function WalletPill() {
  const { wallet, loading } = useCredits();

  if (loading || !wallet) {
    return null;
  }

  const planColors = {
    operator: 'from-slate-500 to-slate-600',
    growth: 'from-blue-500 to-cyan-500',
    scale: 'from-purple-500 to-pink-500',
  };

  const planLabels = {
    operator: 'Operator',
    growth: 'Growth',
    scale: 'Scale',
  };

  const isLow = wallet.plan !== 'scale' && wallet.credits_remaining < 1000;

  return (
    <div className="flex items-center gap-2">
      {/* Plan Badge */}
      <div
        className={`flex items-center gap-1.5 rounded-full bg-gradient-to-r ${
          planColors[wallet.plan]
        } px-3 py-1 text-xs font-semibold text-white shadow-lg`}
      >
        <Zap className="h-3 w-3" />
        {planLabels[wallet.plan]}
      </div>

      {/* Credits Display */}
      <div
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-lg ${
          isLow
            ? 'border-red-500/30 bg-red-500/10 text-red-200'
            : 'border-white/10 bg-white/5 text-white'
        }`}
      >
        <Coins className="h-3 w-3" />
        {wallet.plan === 'scale' ? (
          <span>Unlimited</span>
        ) : (
          <span>{(wallet.credits_remaining ?? 0).toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}
