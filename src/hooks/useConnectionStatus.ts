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

      // Special handling for Meta - use Netlify function instead of connected_accounts table
      if (provider === 'meta') {
        try {
          const res = await fetch(`/.netlify/functions/meta-credentials?userId=${user.id}`);
          const json = await res.json();

          if (!res.ok) {
            console.warn(`[useConnectionStatus] Meta credentials request failed:`, json);
            setError(json.error || 'Failed to check Meta connection');
            setStatus('disconnected');
            setLastConnectedAt(undefined);
            setData(undefined);
            return;
          }

          if (json.connected && json.credentials) {
            setStatus('connected');
            setLastConnectedAt(json.credentials.updatedAt || json.credentials.createdAt);
            setData({
              meta_user_id: json.credentials.metaUserId,
              meta_user_name: json.credentials.metaUserName,
              ad_account_count: json.credentials.adAccounts?.length || 0,
              facebook_page_count: json.credentials.pages?.length || 0,
              instagram_account_count: json.credentials.instagramAccounts?.length || 0,
              pixel_count: json.credentials.pixels?.length || 0,
            });
          } else {
            setStatus('disconnected');
            setLastConnectedAt(undefined);
            setData(undefined);
          }
        } catch (fetchErr: any) {
          console.error(`[useConnectionStatus] Error calling meta-credentials:`, fetchErr);
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
