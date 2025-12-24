import React, { useEffect, useState } from 'react';
import { Activity, AlertCircle, CheckCircle, Clock, Database } from 'lucide-react';
import { getManagerContext } from '../../ai/context/getManagerContext';
import type { ManagerContext } from '../../ai/context/getManagerContext';

interface AdsDataStatusProps {
  userId: string;
}

export const AdsDataStatus: React.FC<AdsDataStatusProps> = ({ userId }) => {
  const [context, setContext] = useState<ManagerContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    loadContext();
  }, [userId]);

  const loadContext = async () => {
    setLoading(true);
    try {
      const ctx = await getManagerContext(userId);
      setContext(ctx);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('[AdsDataStatus] Failed to load context:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !context) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <div className="flex items-center gap-2 text-white/60">
          <Database className="w-4 h-4 animate-pulse" />
          <span className="text-sm">Loading data status...</span>
        </div>
      </div>
    );
  }

  // Build status messages from manager context
  const metaStatus = context.meta.connected
    ? `Connected (${context.meta.campaigns.length} campaigns, ${context.meta.adAccounts.length} accounts)`
    : 'Not connected';

  const ghosteStatus = `${context.ghoste.campaigns.length} campaigns (${context.ghoste.drafts} drafts)`;

  const trackingStatus = `${context.tracking.clicks7d} events (7d)`;

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-white">AI Data Status</h3>
        </div>
        <button
          onClick={loadContext}
          className="text-xs text-white/60 hover:text-white transition"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {/* Meta Status */}
        <div className="flex items-start gap-2">
          {context.meta.connected ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="text-xs font-medium text-white">Meta Ads</div>
            <div className="text-xs text-white/60">{metaStatus}</div>
            {context.meta.errors.length > 0 && (
              <div className="text-xs text-red-400 mt-1">
                {context.meta.errors[0]}
              </div>
            )}
          </div>
        </div>

        {/* Ghoste Ads Status */}
        <div className="flex items-start gap-2">
          <Activity className="w-4 h-4 text-blue-400 mt-0.5" />
          <div className="flex-1">
            <div className="text-xs font-medium text-white">Ghoste Ads</div>
            <div className="text-xs text-white/60">{ghosteStatus}</div>
          </div>
        </div>

        {/* Tracking Status */}
        <div className="flex items-start gap-2">
          <Activity className="w-4 h-4 text-purple-400 mt-0.5" />
          <div className="flex-1">
            <div className="text-xs font-medium text-white">Tracking</div>
            <div className="text-xs text-white/60">{trackingStatus}</div>
          </div>
        </div>
      </div>

      {/* Last Sync */}
      {context.meta.lastSyncAt && (
        <div className="flex items-center gap-2 pt-2 border-t border-white/10">
          <Clock className="w-3 h-3 text-white/40" />
          <span className="text-xs text-white/40">
            Last sync: {new Date(context.meta.lastSyncAt).toLocaleString()}
          </span>
        </div>
      )}

      {/* Refresh indicator */}
      <div className="text-xs text-white/40 text-center">
        Updated: {lastRefresh.toLocaleTimeString()}
      </div>
    </div>
  );
};
