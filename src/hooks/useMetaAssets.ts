import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type MetaAssets = {
  id: string;
  user_id: string;
  meta_user_id: string | null;
  business_id: string | null;
  business_name: string | null;
  page_id: string | null;
  page_name: string | null;
  instagram_id: string | null;
  instagram_username: string | null;
  ad_account_id: string | null;
  ad_account_name: string | null;
  pixel_id: string | null;
  pixel_name: string | null;
  configuration_complete?: boolean;
  created_at: string;
  updated_at: string;
};

type UseMetaAssetsReturn = {
  assets: MetaAssets | null;
  isLoading: boolean;
  hasAssets: boolean;
  isConfigured: boolean;
  error: string | null;
  refreshAssets: () => Promise<void>;
};

/**
 * Hook to fetch and manage user's selected Meta assets
 */
export function useMetaAssets(): UseMetaAssetsReturn {
  const [assets, setAssets] = useState<MetaAssets | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasAssets = !!assets && !!(assets.business_id || assets.page_id || assets.ad_account_id);

  // Check if Meta is fully configured - requires all critical fields
  const isConfigured = !!assets &&
    !!assets.business_id &&
    !!assets.page_id &&
    !!assets.ad_account_id &&
    // Either has configuration_complete flag OR has all required fields
    (assets.configuration_complete === true || (!!assets.business_id && !!assets.ad_account_id && !!assets.page_id));

  const loadAssets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setAssets(null);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('meta_credentials')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) {
        console.error('[useMetaAssets] Failed to fetch assets:', fetchError);
        setError(fetchError.message);
        return;
      }

      setAssets(data);
    } catch (err: any) {
      console.error('[useMetaAssets] Error:', err);
      setError(err.message || 'Failed to load Meta assets');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  return {
    assets,
    isLoading,
    hasAssets,
    isConfigured,
    error,
    refreshAssets: loadAssets,
  };
}
