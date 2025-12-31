import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';

type ConnectedAccountRow = {
  provider: string;
  last_connected_at?: string;
  data?: Record<string, any>;
};

export interface ConnectionStatus {
  loading: boolean;
  status: 'connected' | 'disconnected';
  connected: boolean;
  lastConnectedAt?: string;
  data?: Record<string, any>;
  error?: string;
  refresh: () => void;
}

/**
 * Hook to check if a specific provider is connected
 * Reads from the unified connected_accounts table
 *
 * @param provider - The provider to check ('meta', 'google_calendar', 'mailchimp', 'tiktok', etc.)
 * @returns Connection status with loading state
 */
export function useConnectionStatus(provider: string): ConnectionStatus {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [lastConnectedAt, setLastConnectedAt] = useState<string | undefined>();
  const [data, setData] = useState<Record<string, any> | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);

  const load = async () => {
    if (!user?.id) {
      setLoading(false);
      setStatus('disconnected');
      return;
    }

    try {
      setLoading(true);
      setError(undefined);

      // Special handling for Meta - use safe RPC instead of Netlify function or direct table query
      if (provider === 'meta') {
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_meta_connection_status');

          if (rpcError) {
            console.warn(`[useConnectionStatus] Meta RPC failed:`, rpcError);
            setError(rpcError.message || 'Failed to check Meta connection');
            setStatus('disconnected');
            setLastConnectedAt(undefined);
            setData(undefined);
            return;
          }

          if (rpcData && rpcData.ok === false) {
            console.warn(`[useConnectionStatus] Meta RPC returned error:`, rpcData.error);
            setError(rpcData.error || 'Failed to check Meta connection');
            setStatus('disconnected');
            setLastConnectedAt(undefined);
            setData(undefined);
            return;
          }

          // Use auth_connected for connection status (not assets_configured)
          // auth_connected = true means OAuth token is valid
          // assets_configured = true means required assets are selected
          const authConnected = rpcData?.auth_connected === true;
          const assetsConfigured = rpcData?.assets_configured === true;

          console.log('[useConnectionStatus] Meta status:', {
            auth_connected: authConnected,
            assets_configured: assetsConfigured,
            missing_assets: rpcData?.missing_assets,
          });

          if (authConnected) {
            setStatus('connected');
            setLastConnectedAt(rpcData.last_updated || undefined);
            setData({
              auth_connected: authConnected,
              assets_configured: assetsConfigured,
              missing_assets: rpcData.missing_assets || [],
              ad_account_id: rpcData.ad_account_id,
              ad_account_name: rpcData.ad_account_name,
              page_id: rpcData.page_id,
              page_name: rpcData.page_name,
              instagram_actor_id: rpcData.instagram_actor_id,
              instagram_account_count: rpcData.instagram_account_count || 0,
              pixel_id: rpcData.pixel_id,
              has_valid_token: rpcData.has_token && rpcData.token_valid,
            });
          } else {
            setStatus('disconnected');
            setLastConnectedAt(undefined);
            setData(undefined);
          }
        } catch (fetchErr: any) {
          console.error(`[useConnectionStatus] Error calling Meta RPC:`, fetchErr);
          setError(fetchErr?.message || 'Network error');
          setStatus('disconnected');
        }
        return;
      }

      // For other providers (mailchimp, tiktok, google_calendar), use connected_accounts table
      const { data: row, error: queryError } = await supabase
        .from('connected_accounts')
        .select('provider, last_connected_at, data')
        .eq('user_id', user.id)
        .eq('provider', provider)
        .maybeSingle();

      if (queryError) {
        console.warn(`[useConnectionStatus] Provider not connected: ${provider}`, queryError.message);
        setError(queryError.message);
        setStatus('disconnected');
      } else if (row && (row.last_connected_at || row.data)) {
        // Connected if row exists and has either last_connected_at or data with tokens
        setStatus('connected');
        setLastConnectedAt(row.last_connected_at || undefined);
        setData(row.data || undefined);
      } else {
        setStatus('disconnected');
        setLastConnectedAt(undefined);
        setData(undefined);
      }
    } catch (e: any) {
      console.warn(`[useConnectionStatus] Error checking provider: ${provider}`, e?.message || String(e));
      setError(e?.message || String(e));
      setStatus('disconnected');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [provider, user?.id, refreshKey]);

  const refresh = () => {
    console.log(`[useConnectionStatus] Manual refresh triggered for ${provider}`);
    setRefreshKey(prev => prev + 1);
  };

  return {
    loading,
    status,
    connected: status === 'connected',
    lastConnectedAt,
    data,
    error,
    refresh,
  };
}
