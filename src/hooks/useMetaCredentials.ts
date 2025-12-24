import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export type MetaCredentials = {
  user_id: string;
  ad_account_id: string | null;
  page_id: string | null;
  access_token: string | null;
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

      const { data, error } = await supabase
        .from("meta_credentials")
        .select(
          "user_id, access_token, ad_account_id, page_id, instagram_accounts, pixel_id, conversion_api_token, pixel_verified"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.warn("[useMetaCredentials] read failed", error);
        setError(error);
        setMeta(null);
      } else {
        setMeta((data as any) ?? null);
      }

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [userId]);

  const flags = useMemo(() => {
    const isMetaConnected = Boolean(meta?.access_token);
    const isMetaConfigured = Boolean(meta?.ad_account_id && meta?.page_id);
    // Keep legacy isMetaReady for backward compatibility
    const isMetaReady = isMetaConfigured;
    return { isMetaConnected, isMetaConfigured, isMetaReady };
  }, [meta]);

  return { meta, ...flags, loading, error };
}
