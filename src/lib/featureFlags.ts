import { supabase } from "./supabaseClient";

export type FeatureFlags = {
  pro: boolean;
  ads: boolean;
  social_poster: boolean;
  smart_links: boolean;
  listening_parties: boolean;
  splits: boolean;
  analytics: boolean;
  ghoste_ai: boolean;
};

const DEFAULT_FLAGS: FeatureFlags = {
  pro: false,
  ads: true,
  social_poster: true,
  smart_links: true,
  listening_parties: true,
  splits: true,
  analytics: true,
  ghoste_ai: true,
};

/**
 * Returns true if the currently signed-in user has a DB override granting all features.
 * Uses the Supabase RPC: public.has_all_features_override()
 */
export async function hasAllFeaturesOverride(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("has_all_features_override");
    if (error) {
      console.warn("[FeatureFlags] RPC error:", error);
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn("[FeatureFlags] Exception calling RPC:", err);
    return false;
  }
}

/**
 * Returns app feature flags taking dev overrides into account.
 * If override = true, every flag is forced true.
 */
export async function getEffectiveFeatures(): Promise<FeatureFlags> {
  const overridden = await hasAllFeaturesOverride();
  if (overridden) {
    return {
      pro: true,
      ads: true,
      social_poster: true,
      smart_links: true,
      listening_parties: true,
      splits: true,
      analytics: true,
      ghoste_ai: true,
    };
  }
  return DEFAULT_FLAGS;
}
