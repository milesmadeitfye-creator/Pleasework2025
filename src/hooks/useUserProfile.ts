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
import { supabase } from "../lib/supabaseClient";

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

    setIsLoading(true);
    setError(null);

    try {
      // CRITICAL: Load wallet balances from user_wallets (source of truth)
      const { data: walletData, error: walletError } = await supabase
        .from("user_wallets")
        .select("manager_budget_balance, tools_budget_balance")
        .eq("user_id", user.id)
        .maybeSingle();

      if (walletError) {
        console.error("[useUserProfile] Failed to load wallet:", walletError);
      }

      // Load profile info (plan, subscription, etc.)
      const { data: profileData, error: profileError } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("[useUserProfile] Failed to load profile:", profileError);
        setError(profileError.message);
        setIsLoading(false);
        return;
      }

      if (!profileData) {
        // Profile doesn't exist - create with defaults
        console.log("[useUserProfile] No profile found, creating default for user:", user.id);
        const { data: inserted, error: insertError } = await supabase
          .from("user_profiles")
          .insert({
            id: user.id,
            plan: "free",
            is_pro: false,
            credits_manager: 0,
            credits_tools: 1000,
          })
          .select("*")
          .single();

        if (insertError) {
          console.error("[useUserProfile] Failed to create profile:", insertError);
          setError(insertError.message);
          setIsLoading(false);
          return;
        }

        // Combine profile with wallet data (if available)
        const combinedProfile = {
          ...inserted,
          credits_manager: walletData?.manager_budget_balance ?? inserted.credits_manager ?? 0,
          credits_tools: walletData?.tools_budget_balance ?? inserted.credits_tools ?? 1000,
        } as UserProfile;

        console.log("[useUserProfile] Created profile, wallet balances from DB:", combinedProfile);
        setProfile(combinedProfile);
        setIsLoading(false);
        return;
      }

      // CRITICAL: Use wallet balances from user_wallets, not user_profiles
      const combinedProfile = {
        ...profileData,
        credits_manager: walletData?.manager_budget_balance ?? profileData.credits_manager ?? 0,
        credits_tools: walletData?.tools_budget_balance ?? profileData.credits_tools ?? 0,
      } as UserProfile;

      console.log("[useUserProfile] Loaded fresh wallet balances from user_wallets:", {
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

  // Refetch profile when tab becomes visible
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('[useUserProfile] Tab became visible, refetching profile');
        refetch();
      }
    };

    const handleFocus = () => {
      console.log('[useUserProfile] Window focused, refetching profile');
      refetch();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  // Optional: Subscribe to realtime changes on user_profiles
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`profile:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useUserProfile] Realtime update detected:', payload);
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

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
