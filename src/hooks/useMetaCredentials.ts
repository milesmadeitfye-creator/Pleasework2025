import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase.client";

export type MetaCredentials = {
  user_id: string;
  ad_account_id: string | null;
  page_id: string | null;
  access_token: string | null;
  expires_at?: string | null;
  system_user_token: string | null;
  pixel_id: string | null;
  conversion_api_token: string | null;
  pixel_verified: boolean | null;
  instagram_accounts: any | null; // jsonb
  created_at?: string | null;
  updated_at?: string | null;
};

export function useMetaCredentials(userId?: string) {
  const [meta, setMeta] = useState<MetaCredentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Refetch function that can be called from outside
  const refetch = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    if (!userId) {
      setMeta(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);

      // Use safe RPC instead of direct table query to avoid 403 RLS errors
      const { data, error } = await supabase.rpc('get_meta_connection_status');

      if (!mounted) return;

      if (error) {
        console.warn("[useMetaCredentials] RPC failed", error);
        setError(error);
        setMeta(null);
      } else if (data && data.ok === false) {
        console.warn("[useMetaCredentials] RPC returned error", data.error);
        setError(new Error(data.error));
        setMeta(null);
      } else if (data && data.is_connected) {
        // Transform RPC response to match expected MetaCredentials shape
        const credentials: MetaCredentials = {
          user_id: userId,
          ad_account_id: data.ad_account_id || null,
          page_id: data.page_id || null,
          access_token: data.has_valid_token ? 'connected' : null, // Don't expose actual token
          expires_at: null,
          system_user_token: null,
          pixel_id: data.pixel_id || null,
          conversion_api_token: null,
          pixel_verified: null,
          instagram_accounts: data.instagram_account_count > 0 ? { count: data.instagram_account_count } : null,
          created_at: null,
          updated_at: data.last_updated || null,
        };

        setMeta(credentials);

        // Log warning if token is not valid
        if (!data.has_valid_token) {
          console.warn('[useMetaCredentials] Access token expired - user should reconnect Meta');
        }
      } else {
        // Not connected
        setMeta(null);
      }

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [userId, refreshTrigger]);

  const flags = useMemo(() => {
    const isMetaConnected = Boolean(meta?.access_token);
    const isMetaConfigured = Boolean(meta?.ad_account_id && meta?.page_id);
    // Keep legacy isMetaReady for backward compatibility
    const isMetaReady = isMetaConfigured;
    return { isMetaConnected, isMetaConfigured, isMetaReady };
  }, [meta]);

  return { meta, ...flags, loading, error, refetch };
}
