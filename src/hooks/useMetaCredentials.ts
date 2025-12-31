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
  instagram_accounts: any | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type MetaCheckmarks = {
  step1_auth: boolean;
  step2_ad_account: boolean;
  step3_page: boolean;
  step4_instagram: boolean;
  step5_pixel: boolean;
};

export function useMetaCredentials(userId?: string) {
  const [meta, setMeta] = useState<MetaCredentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [checkmarks, setCheckmarks] = useState<MetaCheckmarks | null>(null);

  const refetch = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    if (!userId) {
      setMeta(null);
      setCheckmarks(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          console.warn("[useMetaCredentials] No session token");
          setMeta(null);
          setCheckmarks(null);
          setLoading(false);
          return;
        }

        const response = await fetch('/.netlify/functions/meta-status', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (!mounted) return;

        const data = await response.json();

        if (data.error && !data.auth_connected) {
          console.warn("[useMetaCredentials] Meta status returned error:", data.error);
          setError(new Error(data.error));
          setMeta(null);
          setCheckmarks(data.checkmarks || null);
        } else if (data.auth_connected) {
          const credentials: MetaCredentials = {
            user_id: userId,
            ad_account_id: data.ad_account_id || null,
            page_id: data.page_id || null,
            access_token: data.auth_connected ? 'connected' : null,
            expires_at: null,
            system_user_token: null,
            pixel_id: data.pixel_id || null,
            conversion_api_token: null,
            pixel_verified: null,
            instagram_accounts: data.instagram_actor_id ? { id: data.instagram_actor_id } : null,
            created_at: null,
            updated_at: null,
          };

          setMeta(credentials);
          setCheckmarks(data.checkmarks || null);

          console.log('[useMetaCredentials] Meta status loaded:', {
            auth_connected: data.auth_connected,
            assets_configured: data.assets_configured,
            checkmarks: data.checkmarks,
            source: data.source,
          });
        } else {
          setMeta(null);
          setCheckmarks(data.checkmarks || null);
        }
      } catch (err: any) {
        console.error("[useMetaCredentials] Failed to fetch Meta status:", err);
        if (mounted) {
          setError(err);
          setMeta(null);
          setCheckmarks(null);
        }
      }

      if (mounted) {
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId, refreshTrigger]);

  const flags = useMemo(() => {
    const isMetaConnected = Boolean(meta?.access_token);
    const isMetaConfigured = Boolean(meta?.ad_account_id && meta?.page_id);
    const isMetaReady = isMetaConfigured;
    return { isMetaConnected, isMetaConfigured, isMetaReady };
  }, [meta]);

  return { meta, checkmarks, ...flags, loading, error, refetch };
}
