import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetches a valid Instagram actor ID for the user from connected assets.
 *
 * Priority order:
 * 1. meta_credentials.instagram_actor_id (primary source, set by meta-save-config)
 * 2. meta_instagram_accounts.instagram_id (legacy fallback)
 *
 * @param supabase - Supabase client with service role key
 * @param userId - User ID to fetch Instagram account for
 * @returns Instagram actor ID string, or null if not found/invalid
 */
export async function getInstagramActorIdForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  try {
    // PRIORITY 1: Check meta_credentials.instagram_actor_id (primary source, text field)
    const { data: creds, error: credsError } = await supabase
      .from("meta_credentials")
      .select("instagram_actor_id, instagram_accounts")
      .eq("user_id", userId)
      .maybeSingle();

    if (!credsError && creds?.instagram_actor_id) {
      const id = creds.instagram_actor_id;
      if (typeof id === "string" && id.trim().length > 0) {
        console.log("[meta-instagram-helper] ✅ Found Instagram actor ID from meta_credentials.instagram_actor_id");
        return id;
      }
    }

    // PRIORITY 2: Check meta_credentials.instagram_accounts (JSONB array)
    if (!credsError && creds?.instagram_accounts) {
      const accounts = Array.isArray(creds.instagram_accounts)
        ? creds.instagram_accounts
        : [];

      if (accounts.length > 0 && accounts[0]?.id) {
        const id = accounts[0].id;
        if (typeof id === "string" && id.trim().length > 0) {
          console.log("[meta-instagram-helper] ✅ Found Instagram actor ID from meta_credentials.instagram_accounts[0].id");
          return id;
        }
      }
    }

    // PRIORITY 3: Fallback to meta_instagram_accounts (legacy table)
    const { data, error } = await supabase
      .from("meta_instagram_accounts")
      .select("instagram_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[meta-instagram-helper] Failed to fetch instagram_actor_id from meta_instagram_accounts", error);
      return null;
    }

    const id = data?.instagram_id;

    // Validate ID is non-empty string
    if (id && typeof id === "string" && id.trim().length > 0) {
      console.log("[meta-instagram-helper] ✅ Found Instagram actor ID from meta_instagram_accounts (legacy table)");
      return id;
    }

    console.log("[meta-instagram-helper] ⚠️ No Instagram actor ID found - campaigns will be Facebook-only");
    return null;
  } catch (err) {
    console.error("[meta-instagram-helper] Unexpected error fetching Instagram ID", err);
    return null;
  }
}

/**
 * Removes Instagram placements from targeting configuration.
 *
 * Use this when Instagram actor ID is not available but Instagram
 * placements were requested. This allows the ad to run on Facebook only.
 *
 * @param targeting - Targeting object with publisher_platforms and positions
 * @returns Sanitized targeting without Instagram
 */
export function removeInstagramPlacements(targeting: any): any {
  if (!targeting) return targeting;

  const cleaned = { ...targeting };

  // Remove 'instagram' from publisher_platforms array
  if (Array.isArray(cleaned.publisher_platforms)) {
    cleaned.publisher_platforms = cleaned.publisher_platforms.filter(
      (platform: string) => platform !== "instagram"
    );
  }

  // Remove instagram_positions field entirely
  if (cleaned.instagram_positions) {
    delete cleaned.instagram_positions;
  }

  return cleaned;
}

/**
 * Checks if targeting configuration requests Instagram placements.
 *
 * @param targeting - Targeting object with publisher_platforms
 * @returns true if Instagram placements are requested
 */
export function wantsInstagramPlacements(targeting: any): boolean {
  if (!targeting) return false;

  const publisherPlatforms = targeting.publisher_platforms || [];

  return (
    Array.isArray(publisherPlatforms) &&
    publisherPlatforms.includes("instagram")
  );
}
