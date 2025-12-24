import { Sparkles, RefreshCw } from 'lucide-react';

type OverviewHeaderProps = {
  displayName: string;
  isLoading: boolean;
  onRefresh: () => void;
};

export function OverviewHeader({ displayName, isLoading, onRefresh }: OverviewHeaderProps) {
  return (
    <div className="mb-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-950 to-black px-6 py-5 md:px-8 md:py-6 shadow-[0_20px_60px_rgba(15,23,42,0.9)]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-52 w-52 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-40 w-40 rounded-full bg-indigo-500/10 blur-2xl" />

        <div className="relative flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-blue-200">
              <Sparkles className="h-3 w-3" />
              Overview
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-slate-50 md:text-3xl">
              Welcome back, <span className="text-blue-400">{displayName}</span>
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-slate-300/80">
              Here&apos;s what your campaigns, streams, and links have been doing across Ghoste One
              in the last few days.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden flex-col text-right text-xs text-slate-400 md:flex">
              <span className="uppercase tracking-[0.14em] text-slate-500">
                Snapshot
              </span>
              <span className="mt-0.5 text-slate-200">
                Updated in real-time
              </span>
            </div>
            <button
              type="button"
              disabled={isLoading}
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-50 hover:border-blue-500 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
