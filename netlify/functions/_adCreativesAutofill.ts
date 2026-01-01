import type { SupabaseClient } from '@supabase/supabase-js';

interface GoalAsset {
  url: string;
  id: string;
  source: string;
}

interface AutofillResult {
  goal_key: string;
  updated_count: number;
  errors: string[];
}

/**
 * Auto-fills destination_url for ad_creatives based on goal_assets
 * Called before campaign launch to ensure all creatives have proper links
 */
export async function autofillCreativeDestinations(
  supabase: SupabaseClient,
  userId: string,
  goalKeys?: string[]
): Promise<AutofillResult[]> {
  const results: AutofillResult[] = [];

  try {
    // Load user's ads mode settings to get goal_assets
    const { data: modeData, error: modeError } = await supabase
      .from('user_ads_modes')
      .select('goal_assets')
      .eq('user_id', userId)
      .maybeSingle();

    if (modeError) throw modeError;

    const goalAssets = modeData?.goal_assets || {};

    // If specific goals provided, filter to those; otherwise process all
    const goalsToProcess = goalKeys || Object.keys(goalAssets);

    for (const goalKey of goalsToProcess) {
      const asset: GoalAsset | undefined = goalAssets[goalKey];

      if (!asset || !asset.url) {
        console.log(`[autofillCreativeDestinations] No asset URL for goal ${goalKey}`);
        results.push({
          goal_key: goalKey,
          updated_count: 0,
          errors: ['No destination URL configured for this goal'],
        });
        continue;
      }

      const errors: string[] = [];

      try {
        // Find creatives for this goal that need destination_url
        const { data: creativesNeedingUrl, error: selectError } = await supabase
          .from('ad_creatives')
          .select('id, destination_url')
          .eq('owner_user_id', userId)
          .eq('goal_key', goalKey)
          .eq('status', 'ready')
          .or('destination_url.is.null,destination_url.eq.');

        if (selectError) throw selectError;

        const creativesToUpdate = (creativesNeedingUrl || []).filter(
          (c) => !c.destination_url || c.destination_url.trim() === ''
        );

        if (creativesToUpdate.length === 0) {
          console.log(`[autofillCreativeDestinations] All creatives for ${goalKey} already have URLs`);
          results.push({
            goal_key: goalKey,
            updated_count: 0,
            errors: [],
          });
          continue;
        }

        // Update all creatives with the destination URL
        const { error: updateError } = await supabase
          .from('ad_creatives')
          .update({ destination_url: asset.url })
          .in(
            'id',
            creativesToUpdate.map((c) => c.id)
          );

        if (updateError) throw updateError;

        console.log(
          `[autofillCreativeDestinations] Updated ${creativesToUpdate.length} creatives for ${goalKey} with URL ${asset.url}`
        );

        results.push({
          goal_key: goalKey,
          updated_count: creativesToUpdate.length,
          errors: [],
        });
      } catch (err) {
        console.error(`[autofillCreativeDestinations] Error for goal ${goalKey}:`, err);
        errors.push(err instanceof Error ? err.message : 'Unknown error');
        results.push({
          goal_key: goalKey,
          updated_count: 0,
          errors,
        });
      }
    }

    return results;
  } catch (err) {
    console.error('[autofillCreativeDestinations] Fatal error:', err);
    throw err;
  }
}

/**
 * Validates that all active goals have required destination URLs
 * Returns array of goals missing required URLs
 */
export async function validateGoalAssets(
  supabase: SupabaseClient,
  userId: string,
  activeGoals: string[]
): Promise<string[]> {
  try {
    const { data: modeData } = await supabase
      .from('user_ads_modes')
      .select('goal_assets')
      .eq('user_id', userId)
      .maybeSingle();

    const goalAssets = modeData?.goal_assets || {};
    const missingAssets: string[] = [];

    for (const goalKey of activeGoals) {
      const asset = goalAssets[goalKey];

      // Check if goal requires a destination URL
      const requiresUrl = !['brand_awareness', 'virality'].includes(goalKey);

      if (requiresUrl && (!asset || !asset.url)) {
        missingAssets.push(goalKey);
      }
    }

    return missingAssets;
  } catch (err) {
    console.error('[validateGoalAssets] Error:', err);
    return activeGoals; // Assume all missing on error to be safe
  }
}
