import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';

export interface ConnectionStatus {
  loading: boolean;
  status: 'connected' | 'disconnected';
  connected: boolean;
  lastConnectedAt?: string;
  data?: Record<string, any>;
  error?: string;
  refresh: () => void;
}

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

      if (provider === 'meta') {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) {
            console.warn('[useConnectionStatus] No session for Meta status check');
            setStatus('disconnected');
            setLastConnectedAt(undefined);
            setData(undefined);
            return;
          }

          const response = await fetch('/.netlify/functions/meta-status', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });

          const metaData = await response.json();

          const authConnected = metaData?.auth_connected === true;
          const assetsConfigured = metaData?.assets_configured === true;

          console.log('[useConnectionStatus] Meta status:', {
            auth_connected: authConnected,
            assets_configured: assetsConfigured,
            checkmarks: metaData?.checkmarks,
            source: metaData?.source,
          });

          if (authConnected) {
            setStatus('connected');
            setLastConnectedAt(undefined);
            setData({
              auth_connected: authConnected,
              assets_configured: assetsConfigured,
              ready_to_run_ads: metaData.ready_to_run_ads,
              missing_required: metaData.missing_required || [],
              ad_account_id: metaData.ad_account_id,
              ad_account_name: metaData.ad_account_name,
              page_id: metaData.page_id,
              page_name: metaData.page_name,
              instagram_actor_id: metaData.instagram_actor_id,
              instagram_username: metaData.instagram_username,
              pixel_id: metaData.pixel_id,
              checkmarks: metaData.checkmarks,
              optional: metaData.optional,
            });
          } else {
            setStatus('disconnected');
            setLastConnectedAt(undefined);
            setData({
              checkmarks: metaData.checkmarks,
              needs_reconnect: metaData.needs_reconnect,
            });
          }
        } catch (fetchErr: any) {
          console.error('[useConnectionStatus] Error calling meta-status:', fetchErr);
          setError(fetchErr?.message || 'Network error');
          setStatus('disconnected');
        }
        return;
      }

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
