import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { WalletCard } from '../components/dashboard/WalletCard';
import { ManagerModeSelector } from '../components/wallet/ManagerModeSelector';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Zap, TrendingUp, Rocket, Loader2, Lock } from 'lucide-react';
import { useToast } from '../components/Toast';

export default function WalletPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [managerMode, setManagerMode] = useState<'light' | 'moderate' | 'full'>('moderate');
  const [managerBudget, setManagerBudget] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasingPack, setPurchasingPack] = useState<string | null>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [canPurchaseCredits, setCanPurchaseCredits] = useState(false);

  const handleBuyTokenPack = async (pack: 'starter' | 'growth' | 'power') => {
    if (!user) {
      showToast('Please log in to purchase credits', 'error');
      return;
    }

    setPurchasingPack(pack);
    try {
      const response = await fetch('/.netlify/functions/stripe-create-token-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pack,
          userId: user.id,
          userEmail: user.email,
          return_url_base: window.location.origin,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.url) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error: any) {
      console.error('[WalletPage] Checkout error:', error);
      showToast(error.message || 'Failed to start checkout', 'error');
      setPurchasingPack(null);
    }
  };

  useEffect(() => {
    if (!user) return;

    const fetchSettings = async () => {
      setLoading(true);
      try {
        const { data: settings } = await supabase
          .from('manager_settings')
          .select('mode')
          .eq('user_id', user.id)
          .maybeSingle();

        const { data: walletData } = await supabase
          .from('user_wallets')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        setWallet(walletData);
        setManagerMode(settings?.mode || 'moderate');
        setManagerBudget(0);

        // Check if user can purchase credits
        // Must have paid plan AND active/trialing subscription
        const canPurchase =
          walletData &&
          walletData.plan !== 'free' &&
          (walletData.subscription_status === 'active' ||
            walletData.subscription_status === 'trialing');

        setCanPurchaseCredits(canPurchase);
      } catch (err) {
        console.error('[WalletPage] fetch error', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Please log in to view your wallet</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Ghoste Wallet</h1>

        <div className="grid gap-6 mb-6">
          <WalletCard />
        </div>

        {/* Token Refill Cards */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 mb-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white mb-2">Need More Credits?</h2>
            <p className="text-sm text-slate-400">Top up anytime. Credits apply instantly.</p>
          </div>

          {!canPurchaseCredits && wallet && (
            <div className="mb-6 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold text-white mb-1">
                    Subscribe to purchase credits
                  </div>
                  <div className="text-sm text-white/70 mb-3">
                    {wallet.plan === 'free'
                      ? 'Free plan users cannot purchase credits. Subscribe to unlock refills.'
                      : 'You must have an active subscription to purchase credits.'}
                  </div>
                  <button
                    onClick={() => navigate('/subscriptions')}
                    className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-400 transition-colors"
                  >
                    View subscription plans
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${!canPurchaseCredits ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* Starter Pack */}
            <div className="relative rounded-xl border border-slate-700 bg-slate-900/50 p-6 hover:border-slate-600 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-semibold text-white">Starter Refill</h3>
              </div>
              <div className="mb-4">
                <div className="text-2xl font-bold text-white mb-1">10,000 Credits</div>
                <div className="text-slate-400 text-sm">$9.99</div>
              </div>
              <button
                onClick={() => handleBuyTokenPack('starter')}
                disabled={purchasingPack === 'starter'}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {purchasingPack === 'starter' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Buy Starter'
                )}
              </button>
            </div>

            {/* Growth Pack */}
            <div className="relative rounded-xl border-2 border-emerald-500 bg-emerald-500/5 p-6 hover:border-emerald-400 transition-colors">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-3 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-full">
                  RECOMMENDED
                </span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-semibold text-white">Growth Refill</h3>
              </div>
              <div className="mb-4">
                <div className="text-2xl font-bold text-white mb-1">25,000 Credits</div>
                <div className="text-slate-400 text-sm">$24.99</div>
              </div>
              <button
                onClick={() => handleBuyTokenPack('growth')}
                disabled={purchasingPack === 'growth'}
                className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {purchasingPack === 'growth' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Buy Growth'
                )}
              </button>
            </div>

            {/* Power Pack */}
            <div className="relative rounded-xl border border-purple-500 bg-purple-500/5 p-6 hover:border-purple-400 transition-colors">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-3 py-1 bg-purple-500 text-white text-xs font-semibold rounded-full">
                  BEST VALUE
                </span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <Rocket className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">Power Refill</h3>
              </div>
              <div className="mb-4">
                <div className="text-2xl font-bold text-white mb-1">50,000 Credits</div>
                <div className="text-slate-400 text-sm">$39.99</div>
              </div>
              <button
                onClick={() => handleBuyTokenPack('power')}
                disabled={purchasingPack === 'power'}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {purchasingPack === 'power' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Buy Power'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Manager Mode Selector */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 mb-6">
          {!loading && (
            <ManagerModeSelector
              userId={user.id}
              currentMode={managerMode}
              managerBudget={managerBudget}
              onUpdate={() => {
                // Refresh data after update
                window.location.reload();
              }}
            />
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">How Credits Work</h2>
          <div className="space-y-4 text-sm text-slate-300">
            <div>
              <h3 className="font-semibold text-purple-400 mb-1">Manager Budget Credits</h3>
              <p className="text-slate-400">
                Power high-cost strategic actions like AI campaigns, viral lead automation,
                and advanced analytics. These credits fuel your growth initiatives.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-blue-400 mb-1">Tools Budget Credits</h3>
              <p className="text-slate-400">
                Cover utility and rendering actions like video exports, cover art generation,
                link creation, and everyday automation tasks.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800">
              <h3 className="font-semibold text-white mb-1">Getting Credits</h3>
              <p className="text-slate-400">
                Credits are automatically added to your wallet when you subscribe to a plan
                or purchase a top-up. Pro plans include monthly credit allocations.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Using Credits</h3>
              <p className="text-slate-400">
                When you use a feature, the appropriate amount of credits is deducted from
                the relevant budget. All transactions are logged for transparency.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
