import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useMailchimpConnection Hook
 *
 * Source of Truth for Mailchimp Connection:
 * - Table: user_integrations
 * - Key: user_id + provider='mailchimp'
 * - Connected when: access_token exists
 * - Set by: mailchimp-oauth-callback.ts after successful OAuth flow
 *
 * Returns:
 * - loading: boolean - whether we're still fetching the connection status
 * - connected: boolean - whether Mailchimp is connected
 * - connection: object | null - the full connection data from user_integrations
 * - error: string | null - any error that occurred during fetch
 * - refresh: () => void - function to manually refresh the connection status
 */

interface MailchimpConnection {
  id: string;
  user_id: string;
  provider: string;
  access_token?: string;
  refresh_token?: string;
  external_account_id?: string;
  meta?: any;
  expires_at?: string;
  connected_at?: string;
  // Legacy fields for backwards compatibility
  platform?: string;
  api_key?: string;
  server_prefix?: string;
  mailchimp_dc?: string;
  audience_id?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface UseMailchimpConnectionReturn {
  loading: boolean;
  connected: boolean;
  connection: MailchimpConnection | null;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMailchimpConnection(): UseMailchimpConnectionReturn {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<MailchimpConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchConnection = async () => {
    if (!user?.id) {
      setLoading(false);
      setConnection(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('[Mailchimp] Fetching connection for user:', user.id);

      const { data, error: fetchError } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'mailchimp')
        .maybeSingle();

      if (fetchError) {
        console.error('[Mailchimp] Error fetching connection:', fetchError);
        setError(fetchError.message);
        setConnection(null);
      } else if (data) {
        console.log('[Mailchimp] Connection found:', {
          hasAccessToken: !!data.access_token,
          externalAccountId: data.external_account_id,
          dc: data.meta?.data_center || data.server_prefix || data.mailchimp_dc,
        });
        setConnection(data as MailchimpConnection);
        setError(null);
      } else {
        console.log('[Mailchimp] No connection found');
        setConnection(null);
        setError(null);
      }
    } catch (err: any) {
      console.error('[Mailchimp] Unexpected error:', err);
      setError(err.message || 'Failed to fetch Mailchimp connection');
      setConnection(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnection();
  }, [user?.id]);

  const connected = !!connection && (!!connection.access_token || !!connection.api_key);

  return {
    loading,
    connected,
    connection,
    error,
    refresh: fetchConnection,
  };
}
