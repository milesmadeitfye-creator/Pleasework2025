/**
 * useWalletProfile Hook
 *
 * Loads wallet state from user_profiles table:
 * - Pro vs Free status
 * - Manager and Tools credit balances
 *
 * Auto-creates profile with defaults if none exists.
 */

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../hooks/useAuth";

export type WalletProfile = {
  id: string;
  is_pro: boolean;
  plan: string | null;
  credits_manager: number;
  credits_tools: number;
};

export function useWalletProfile() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<WalletProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const load = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (fetchError) {
          console.error("[useWalletProfile] Failed to load profile:", fetchError);
          setError(fetchError);
          setIsLoading(false);
          return;
        }

        if (!data) {
          // Profile doesn't exist - create with defaults
          console.log("[useWalletProfile] No profile found, creating default for user:", user.id);
          const { data: inserted, error: insertError } = await supabase
            .from("user_profiles")
            .insert({
              id: user.id,
              is_pro: false,
              plan: "free",
              credits_manager: 0,
              credits_tools: 1000,
            })
            .select("*")
            .single();

          if (insertError) {
            console.error("[useWalletProfile] Failed to create profile:", insertError);
            setError(insertError);
          } else {
            console.log("[useWalletProfile] Created default profile");
            setProfile(inserted as WalletProfile);
          }
          setIsLoading(false);
          return;
        }

        setProfile(data as WalletProfile);
        setIsLoading(false);
      } catch (err) {
        console.error("[useWalletProfile] Unexpected error:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    };

    void load();
  }, [user, authLoading]);

  const plan = profile?.plan ?? "free";
  const isPro = profile?.is_pro === true || plan === "pro";
  const managerCredits = profile?.credits_manager ?? 0;
  const toolsCredits = profile?.credits_tools ?? 0;

  return {
    profile,
    isLoading: authLoading || isLoading,
    error,
    plan,
    isPro,
    managerCredits,
    toolsCredits,
    setProfile,
  };
}
