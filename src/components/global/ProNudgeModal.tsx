import { useEffect, useState } from 'react';
import { openStripeCheckout } from '../../lib/billing';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useUserPlan } from '../../hooks/useUserPlan';

const LOGIN_FLAG_KEY = 'ghoste_show_pro_on_login';

export function ProNudgeModal() {
  const [open, setOpen] = useState(false);
  const { user, showProOnLogin, setShowProOnLogin } = useAuth();
  const { isPro, loading: planLoading } = useUserPlan();

  useEffect(() => {
    if (!user || planLoading) return;
    if (isPro) return;

    const loginFlag = localStorage.getItem(LOGIN_FLAG_KEY);

    if ((showProOnLogin || loginFlag === '1') && !isPro) {
      setTimeout(() => setOpen(true), 1000);
      setShowProOnLogin(false);
      localStorage.removeItem(LOGIN_FLAG_KEY);
    }
  }, [user, isPro, planLoading, showProOnLogin, setShowProOnLogin]);

  const close = () => {
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-950 to-slate-900 p-6 shadow-2xl m-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-50">
                Power up Ghoste with Credits
              </h3>
              <p className="text-xs text-slate-400">Unlock your full potential</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="text-slate-400 hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-300 mb-4 leading-relaxed">
          All Ghoste features are unlocked! Every AI run, ad launch, and studio render uses Credits
          from your Wallet. Grab a Pro plan or top up your Credits to keep campaigns flowing.
        </p>

        <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-4 mb-5">
          <p className="text-xs font-semibold text-slate-400 mb-3">What you can do:</p>
          <ul className="space-y-2 text-xs text-slate-400">
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
              <span>Launch auto-optimized ad campaigns</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
              <span>Create stunning visuals with Ghoste Studio</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
              <span>Generate smart links, tasks, and automation</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
              <span>AI-powered marketing and strategy</span>
            </li>
          </ul>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={close}
            className="flex-1 rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors border border-slate-800"
          >
            Maybe later
          </button>
          <button
            type="button"
            onClick={() => {
              openStripeCheckout();
              close();
            }}
            className="flex-1 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 px-4 py-3 text-sm font-semibold text-white transition-all shadow-lg shadow-blue-900/40"
          >
            View Pro Plans
          </button>
        </div>
      </div>
    </div>
  );
}
