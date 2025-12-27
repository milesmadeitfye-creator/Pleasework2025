import React, { useEffect, useState } from 'react';
import { Activity, AlertCircle, CheckCircle, Clock, Database, RefreshCw } from 'lucide-react';
import { getManagerContext } from '../../ai/context/getManagerContext';
import type { ManagerContext, SetupStatusInput } from '../../ai/context/getManagerContext';
import { supabase } from '@/lib/supabase.client';

interface AdsDataStatusProps {
  userId: string;
}

export const AdsDataStatus: React.FC<AdsDataStatusProps> = ({ userId }) => {
  const [context, setContext] = useState<ManagerContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    loadContext();
  }, [userId]);

  const loadContext = async () => {
    const isRefresh = context !== null;
    setLoading(!isRefresh);
    setRefreshing(isRefresh);

    try {
      if (!supabase) {
        console.warn('[AdsDataStatus] Supabase not ready');
        setContext(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Call ai_get_setup_status RPC to get canonical Meta connection status
      const { data: setupData, error: setupError } = await supabase
        .rpc('ai_get_setup_status', { p_user_id: userId });

      if (setupError) {
        console.error('[AdsDataStatus] RPC error:', setupError);
        // Fallback: try to get context without setup status
        const ctx = await getManagerContext(userId);
        setContext(ctx);
        setLastRefresh(new Date());
        return;
      }

      // Guard: Check if RPC returned empty/null
      if (!setupData || Object.keys(setupData).length === 0) {
        console.warn('[AdsDataStatus] RPC returned empty object');
        const ctx = await getManagerContext(userId);
        setContext(ctx);
        setLastRefresh(new Date());
        return;
      }

      // Transform RPC response to SetupStatusInput format (use RESOLVED fields)
      const resolved = setupData.resolved || {};
      const hasResolvedAssets = Boolean(resolved.ad_account_id || resolved.page_id || resolved.pixel_id);

      const setupStatus: SetupStatusInput = {
        meta: {
          connected: hasResolvedAssets,
          adAccounts: setupData?.meta?.ad_accounts || [],
          pages: setupData?.meta?.pages || [],
          pixels: setupData?.meta?.pixels || [],
        },
        smartLinks: {
          count: setupData?.smart_links_count || 0,
          recent: setupData?.smart_links_preview || [],
        },
      };

      // Get full context with setup status
      const ctx = await getManagerContext(userId, setupStatus);
      setContext(ctx);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('[AdsDataStatus] Failed to load context:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
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
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="space-y-2">
        {/* Meta Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${context.meta.connected ? 'bg-emerald-400' : 'bg-gray-500'}`} />
            <div className="text-xs font-medium text-white">Meta Ads</div>
          </div>
          <div className="flex items-center gap-1.5">
            {context.meta.connected ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium">Connected</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs text-white/60">Not connected</span>
              </>
            )}
          </div>
        </div>
        {context.meta.connected && context.meta.campaigns.length > 0 && (
          <div className="text-xs text-white/40 ml-4">
            {context.meta.campaigns.length} campaign{context.meta.campaigns.length !== 1 ? 's' : ''}, {context.meta.adAccounts.length} account{context.meta.adAccounts.length !== 1 ? 's' : ''}
          </div>
        )}
        {context.meta.errors.length > 0 && (
          <div className="text-xs text-red-400 ml-4">
            {context.meta.errors[0]}
          </div>
        )}

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
