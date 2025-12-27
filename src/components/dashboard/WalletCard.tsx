import { useState, useEffect } from 'react';
import { FEATURE_COSTS } from '../../lib/wallet';
import { Wallet, TrendingUp, Zap, Sparkles, Crown, ArrowLeftRight, X } from 'lucide-react';
import { useUserProfile } from '../../hooks/useUserProfile';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../../hooks/useAuth';
import { isDevWalletOverride } from '../../lib/devWalletOverride';
import { formatCredits as formatCreditsUtil } from '../../utils/formatCredits';

export function WalletCard() {
  const { user } = useAuth();
  const { profile, isLoading, isPro, creditsManager, creditsTools, refetch, updateCredits } = useUserProfile();
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [direction, setDirection] = useState<'manager_to_tools' | 'tools_to_manager'>('manager_to_tools');
  const [amount, setAmount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user is in dev override mode
  const devWalletOverride = isDevWalletOverride(user);

  // Force refresh wallet balances on mount to ensure fresh data
  useEffect(() => {
    if (typeof refetch === 'function') {
      console.log('[WalletCard] Mounted - forcing wallet balance refresh');
      refetch();
    }
  }, []);

  // Safe numeric defaults to prevent undefined crashes
  const managerCredits = typeof creditsManager === 'number' ? creditsManager : 0;
  const toolsCredits = typeof creditsTools === 'number' ? creditsTools : 0;
  const totalCredits = managerCredits + toolsCredits;

  // Use safe formatter that handles undefined/null/NaN
  const formatCredits = (amount: number | undefined | null) => {
    const n = typeof amount === 'number' && !Number.isNaN(amount) ? amount : 0;
    return n.toLocaleString();
  };

  const maxTransferAmount = direction === 'manager_to_tools' ? managerCredits : toolsCredits;
  const managerAfter = direction === 'manager_to_tools' ? managerCredits - amount : managerCredits + amount;
  const toolsAfter = direction === 'manager_to_tools' ? toolsCredits + amount : toolsCredits - amount;

  const handleTransferClick = async () => {
    setAmount(0);
    setError(null);
    setShowTransferModal(true);

    // Refetch profile to ensure we have the latest credit balances
    if (typeof refetch === 'function') {
      refetch();
    }
  };

  const handleConfirmTransfer = async () => {
    const amountNumber = Number(amount) || 0;

    if (!amountNumber || amountNumber <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    // Simple validation: check if amount is available in source budget
    const hasEnough =
      direction === 'tools_to_manager'
        ? amountNumber <= toolsCredits
        : amountNumber <= managerCredits;

    if (!hasEnough) {
      const budgetName = direction === 'tools_to_manager' ? 'TOOLS' : 'MANAGER';
      const sourceBalance = direction === 'tools_to_manager' ? toolsCredits : managerCredits;
      setError(`Not enough credits in ${budgetName} budget to transfer ${amountNumber} credits. Available: ${formatCredits(sourceBalance)}`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        setError('Not authenticated');
        setIsSubmitting(false);
        return;
      }

      const response = await fetch('/.netlify/functions/wallet-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ direction, amount: amountNumber }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const apiError = data?.message || data?.error || `Transfer failed (status ${response.status})`;
        console.error('[WalletCard] Transfer failed:', { status: response.status, data });
        setError(apiError);
        setIsSubmitting(false);
        return;
      }

      const result = await response.json();

      if (!result.ok) {
        console.error('[WalletCard] Transfer failed:', result);
        const apiError = result.message || result.error || 'Failed to transfer credits';
        setError(apiError);
        setIsSubmitting(false);
        return;
      }

      console.log('[WalletCard] Transfer successful:', result);

      // Close modal
      setShowTransferModal(false);
      setAmount(0);

      // CRITICAL: Always refetch from database to ensure UI matches DB
      // DO NOT manually update UI - let Supabase be the source of truth
      if (typeof refetch === 'function') {
        console.log('[WalletCard] Refetching fresh balances from user_wallets table');
        refetch();
      }
    } catch (err: any) {
      console.error('[WalletCard] Transfer error:', err);
      setError(err.message || 'Unable to transfer credits');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950/95 to-slate-900/95 p-6 backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-50 flex items-center gap-2">
              Ghoste Wallet
              {devWalletOverride && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-600/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold">
                  DEV OVERRIDE
                </span>
              )}
              {isPro && !devWalletOverride && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 text-[10px] font-bold">
                  <Crown className="w-3 h-3" />
                  PRO
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400">
              {isPro ? 'Pro Plan - 10,000/5,000 monthly' : 'Free Plan - 0/1,000 monthly'}
            </p>
          </div>
        </div>
        <button
          onClick={handleTransferClick}
          className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          Transfer
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-8">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-slate-800 rounded w-2/3 mx-auto"></div>
            <div className="h-4 bg-slate-800 rounded w-1/2 mx-auto"></div>
          </div>
        </div>
      )}

      {/* Wallet Content */}
      {!isLoading && (
        <div className="space-y-4">
          {/* Total Credits - Hero Display */}
          <div className="rounded-xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/30 p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium uppercase tracking-wider text-blue-300">
                Total Credits
              </span>
              <Sparkles className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {formatCredits(totalCredits)}
            </div>
            <p className="text-xs text-slate-400">Credits available across both budgets</p>
          </div>

          {/* Budget Breakdown */}
          <div className="grid grid-cols-2 gap-3">
            {/* Manager Budget */}
            <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-medium text-slate-400">Manager</span>
              </div>
              <div className="text-xl font-bold text-purple-400 mb-1">
                {formatCredits(managerCredits)}
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                High-cost strategic actions
              </p>
            </div>

            {/* Tools Budget */}
            <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-medium text-slate-400">Tools</span>
              </div>
              <div className="text-xl font-bold text-blue-400 mb-1">
                {formatCredits(toolsCredits)}
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                Utility & rendering actions
              </p>
            </div>
          </div>

          {/* Budget Descriptions */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-start gap-2">
              <TrendingUp className="w-3 h-3 text-purple-400 mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                <span className="font-semibold text-purple-400">Manager Credits</span> power AI
                features, campaigns, and launches (2,000-3,000 per action)
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Zap className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                <span className="font-semibold text-blue-400">Tools Credits</span> cover
                rendering, studio automation, and everyday tasks (100-1,500 per action)
              </p>
            </div>
          </div>

          {/* Example Costs */}
          <div className="rounded-lg bg-slate-900/40 border border-slate-800 p-3">
            <p className="text-xs font-semibold text-slate-400 mb-2">Example Costs</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Meta Ad Campaign</span>
                <span className="text-purple-400 font-medium">
                  {formatCredits(FEATURE_COSTS.META_AD_CAMPAIGN)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Video Render</span>
                <span className="text-blue-400 font-medium">
                  {formatCredits(FEATURE_COSTS.GHOSTE_STUDIO_VIDEO_RENDER)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Viral Lead Setup</span>
                <span className="text-purple-400 font-medium">
                  {formatCredits(FEATURE_COSTS.VIRAL_LEAD_SETUP)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cover Art Gen</span>
                <span className="text-blue-400 font-medium">
                  {formatCredits(FEATURE_COSTS.COVER_ART_GENERATE)}
                </span>
              </div>
            </div>
          </div>

          {/* Dev Mode Banner */}
          {devWalletOverride && (
            <div className="rounded-lg bg-purple-950/40 border border-purple-500/40 p-3">
              <p className="text-xs text-purple-300 font-medium mb-1">Dev Mode Active</p>
              <p className="text-[10px] text-purple-300/80">
                Credit checks are disabled for this test account. Balances shown may not reflect actual billing.
              </p>
            </div>
          )}

          {/* Low Balance Warning (only show if not in dev mode) */}
          {!devWalletOverride && totalCredits < 1000 && (
            <div className="rounded-lg bg-yellow-950/40 border border-yellow-800/60 p-3">
              <p className="text-xs text-yellow-400 font-medium mb-1">Low Credit Balance</p>
              <p className="text-[10px] text-yellow-300/80">
                Top up your wallet or upgrade your subscription to continue using premium features.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-800 max-w-md w-full p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <ArrowLeftRight className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-50">Transfer Credits</h3>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-6">
              Move credits between Manager and Tools without changing your total balance.
            </p>

            {/* Direction Selection */}
            <div className="space-y-3 mb-4">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Direction
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/50 cursor-pointer hover:border-slate-700 transition-colors">
                  <input
                    type="radio"
                    name="direction"
                    value="manager_to_tools"
                    checked={direction === 'manager_to_tools'}
                    onChange={() => {
                      setDirection('manager_to_tools');
                      setAmount(0);
                      setError(null);
                    }}
                    className="text-blue-500"
                  />
                  <div className="flex items-center gap-2 flex-1">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-slate-200">Manager</span>
                    <span className="text-slate-500">→</span>
                    <Zap className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-slate-200">Tools</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/50 cursor-pointer hover:border-slate-700 transition-colors">
                  <input
                    type="radio"
                    name="direction"
                    value="tools_to_manager"
                    checked={direction === 'tools_to_manager'}
                    onChange={() => {
                      setDirection('tools_to_manager');
                      setAmount(0);
                      setError(null);
                    }}
                    className="text-blue-500"
                  />
                  <div className="flex items-center gap-2 flex-1">
                    <Zap className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-slate-200">Tools</span>
                    <span className="text-slate-500">→</span>
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-slate-200">Manager</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Amount Input */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Amount
              </label>
              <input
                type="number"
                min={1}
                max={maxTransferAmount}
                value={amount || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  setAmount(val);
                  setError(null);
                }}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter amount"
              />
              <p className="mt-2 text-xs text-slate-500">
                Max: {formatCredits(maxTransferAmount)} credits available
              </p>
            </div>

            {/* Preview */}
            <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-4 mb-6">
              <p className="text-xs font-semibold text-slate-400 mb-3">Preview</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-slate-400">Manager</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400 font-medium">{formatCredits(managerCredits)}</span>
                    <span className="text-slate-600">→</span>
                    <span className="text-purple-300 font-semibold">{formatCredits(managerAfter)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-slate-400">Tools</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400 font-medium">{formatCredits(toolsCredits)}</span>
                    <span className="text-slate-600">→</span>
                    <span className="text-blue-300 font-semibold">{formatCredits(toolsAfter)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Total Credits</span>
                  <span className="text-slate-400 font-medium">{formatCredits(totalCredits)}</span>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-800/60">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowTransferModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTransfer}
                disabled={!amount || amount <= 0 || isSubmitting}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-blue-600 disabled:hover:to-purple-600"
              >
                {isSubmitting ? 'Transferring...' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
