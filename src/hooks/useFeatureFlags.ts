import { useEffect, useState } from "react";
import { FeatureFlags, getEffectiveFeatures } from "../lib/featureFlags";
import { supabase } from "../lib/supabaseClient";

export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const f = await getEffectiveFeatures();
    setFlags(f);
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (mounted) await refresh();
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });

    return () => {
      mounted = false;
      sub.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { flags, loading };
}
