/**
 * useUserProfile Hook
 *
 * Reads wallet balances from user_wallets table (source of truth)
 * Reads plan/subscription info from user_profiles table
 *
 * ALWAYS fetches fresh data from Supabase - no caching
 */

import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/lib/supabase";

export type UserProfile = {
  id: string;
  plan: "free" | "pro";
  is_pro: boolean;
  credits_manager: number;
  credits_tools: number;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export function useUserProfile() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const loadProfile = async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    // Guard: Verify we have an authenticated session before loading profile
    if (!supabase) {
      console.warn("[useUserProfile] Supabase client not configured");
      setProfile(null);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      console.log("[useUserProfile] No authenticated session, skipping profile load");
      setProfile(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // CRITICAL: Use RPC to get or create profile (prevents 401 loops)
      const { data: profileData, error: profileError } = await supabase
        .rpc('get_or_create_user_profile');

      if (profileError) {
        console.error("[useUserProfile] Failed to load profile via RPC:", profileError);
        setError(profileError.message);
        setIsLoading(false);
        return;
      }

      if (!profileData) {
        console.error("[useUserProfile] RPC returned no profile data");
        setError("Failed to load profile");
        setIsLoading(false);
        return;
      }

      // CRITICAL: Load wallet balances from user_wallets (source of truth)
      const { data: walletData, error: walletError } = await supabase
        .from("user_wallets")
        .select("manager_budget_balance, tools_budget_balance")
        .eq("user_id", user.id)
        .maybeSingle();

      if (walletError) {
        console.error("[useUserProfile] Failed to load wallet:", walletError);
      }

      // Combine profile with wallet data (wallet is source of truth for credits)
      const combinedProfile = {
        ...profileData,
        credits_manager: walletData?.manager_budget_balance ?? profileData.credits_manager ?? 0,
        credits_tools: walletData?.tools_budget_balance ?? profileData.credits_tools ?? 0,
      } as UserProfile;

      console.log("[useUserProfile] Loaded profile via RPC, wallet balances from DB:", {
        manager: combinedProfile.credits_manager,
        tools: combinedProfile.credits_tools,
      });

      setProfile(combinedProfile);
    } catch (err) {
      console.error("[useUserProfile] Unexpected error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    void loadProfile();
  }, [user, authLoading, refetchTrigger]);

  const plan = profile?.plan ?? "free";
  const isPro = profile?.is_pro === true || plan === "pro";
  const creditsManager = profile?.credits_manager ?? 0;
  const creditsTools = profile?.credits_tools ?? 0;

  const refetch = () => {
    setRefetchTrigger(prev => prev + 1);
  };

  const updateCredits = (manager: number, tools: number) => {
    if (!profile) return;
    setProfile({
      ...profile,
      credits_manager: manager,
      credits_tools: tools,
    });
  };

  return {
    profile,
    isLoading: authLoading || isLoading,
    error,
    plan,
    isPro,
    creditsManager,
    creditsTools,
    refetch,
    updateCredits,
    setProfile,
  };
}
