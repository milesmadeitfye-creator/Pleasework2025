/**
 * useSpendCredits Hook
 *
 * Provides a function to spend credits for a feature before performing the action.
 * Handles:
 * - Pro requirement checking
 * - Insufficient credits errors
 * - Optimistic balance updates
 */

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { FEATURE_COSTS, FeatureCost } from "./creditPricing";
import { useWalletProfile } from "./useWalletProfile";
import { useAuth } from "../../hooks/useAuth";
import { isDevWalletOverride } from "../../lib/devWalletOverride";

export function useSpendCredits() {
  const { user } = useAuth();
  const { profile, isPro, plan, setProfile } = useWalletProfile();
  const [isSpending, setIsSpending] = useState(false);

  // Check if user is in dev override mode
  const devWalletOverride = isDevWalletOverride(user);

  const spendForFeature = async (featureKey: string) => {
    const cost: FeatureCost | undefined = FEATURE_COSTS[featureKey];

    // If no cost defined, skip spending
    if (!cost) {
      console.warn(`[useSpendCredits] No cost defined for feature: ${featureKey}`);
      return { ok: true, skipped: true };
    }

    // DEV OVERRIDE: Skip credit spending for test accounts
    if (devWalletOverride) {
      console.log(`[useSpendCredits] DEV OVERRIDE: Bypassing credit spend for ${featureKey} (user: ${user?.email})`);
      // Return success with current profile to prevent rendering crashes
      // Don't actually modify balances in dev mode
      return {
        ok: true,
        devOverride: true,
        balance: profile || {
          id: user?.id || '',
          is_pro: false,
          plan: 'free',
          credits_manager: 0,
          credits_tools: 0,
        }
      };
    }

    // Check wallet is ready
    if (!profile) {
      throw new Error("WALLET_NOT_READY");
    }

    // Check Pro requirement
    if (cost.requiresPro && !isPro) {
      throw new Error("PRO_REQUIRED");
    }

    setIsSpending(true);
    try {
      const { data, error } = await supabase.rpc("spend_credits", {
        p_pool: cost.pool,
        p_amount: cost.amount,
        p_feature_key: featureKey,
      });

      if (error) {
        console.error("[useSpendCredits] RPC error:", error);
        throw error;
      }

      // Update local profile with new balances
      if (data && setProfile) {
        setProfile(data);
      }

      console.log(`[useSpendCredits] Successfully spent ${cost.amount} ${cost.pool} credits for ${featureKey}`);
      return { ok: true, balance: data };
    } finally {
      setIsSpending(false);
    }
  };

  return {
    spendForFeature,
    isSpending,
    isPro,
    plan,
    profile
  };
}
