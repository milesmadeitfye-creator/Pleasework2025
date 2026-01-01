import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { autofillCreativeDestinations, validateGoalAssets } from "./_adCreativesAutofill";

/**
 * Auto-fills destination_url for ad creatives before campaign launch
 * Ensures all creatives have proper links from goal_assets
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  const supabase = getSupabaseAdmin();

  const authHeader = event.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "unauthorized" }),
    };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "invalid_token" }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { goal_keys, validate_only = false } = body;

    console.log('[ads-creatives-autofill] Processing for user:', user.id);

    if (validate_only) {
      // Just validate, don't update
      const missingAssets = await validateGoalAssets(supabase, user.id, goal_keys || []);

      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          valid: missingAssets.length === 0,
          missing_assets: missingAssets,
          message: missingAssets.length > 0
            ? `Missing destination URLs for: ${missingAssets.join(', ')}`
            : 'All goals have required destination URLs',
        }),
      };
    }

    // Perform autofill
    const results = await autofillCreativeDestinations(supabase, user.id, goal_keys);

    const totalUpdated = results.reduce((sum, r) => sum + r.updated_count, 0);
    const hasErrors = results.some((r) => r.errors.length > 0);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        results,
        total_updated: totalUpdated,
        has_errors: hasErrors,
        message: `Auto-filled destination URLs for ${totalUpdated} creatives across ${results.length} goals`,
      }),
    };
  } catch (err: any) {
    console.error('[ads-creatives-autofill] Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: "internal_error",
        message: err.message || "Failed to autofill creative destinations",
      }),
    };
  }
};
