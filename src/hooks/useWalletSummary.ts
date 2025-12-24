import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { safeFetchJSON } from "../lib/safeFetchJSON";
import { FUNCTIONS_ORIGIN } from "../lib/functionsOrigin";

interface WalletSummary {
  user_id: string;
  total_balance: number;
  safety_reserve: number;
  ai_credits: number;
  ad_budget: number;
  updated_at: string;
}

export function useWalletSummary() {
  const [data, setData] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (mounted) {
            setError("No session");
            setLoading(false);
          }
          return;
        }

        const url = `${FUNCTIONS_ORIGIN}/.netlify/functions/post-auth`;

        try {
          const j = await safeFetchJSON(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify({})
          });

          if (!mounted) return;
          setData(j.wallet);
        } catch (fetchErr: any) {
          console.warn('[useWalletSummary] post-auth failed, ignoring:', fetchErr.message);
          if (mounted) {
            setData(null);
          }
        }
      } catch (e: any) {
        if (!mounted) return;
        console.error('[useWalletSummary] Error loading wallet:', e);
        setError(e.message || "Error loading wallet");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return { data, loading, error };
}
