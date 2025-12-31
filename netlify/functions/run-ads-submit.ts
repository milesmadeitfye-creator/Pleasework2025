import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { buildAndLaunchCampaign, RunAdsInput } from "./_runAdsCampaignBuilder";

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

    const {
      ad_goal,
      daily_budget_cents,
      automation_mode,
      creative_ids,
      draft_id,
      total_budget_cents,
      smart_link_id,
      one_click_link_id,
      platform,
      profile_url,
      capture_page_url,
    } = body;

    // Validate required fields
    if (!ad_goal || !daily_budget_cents || !automation_mode) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "missing_required_fields",
          details: "ad_goal, daily_budget_cents, and automation_mode are required",
        }),
      };
    }

    // Load creatives from DB if draft_id provided OR if creative_ids not provided
    let resolvedCreativeIds = creative_ids || [];

    if (draft_id && (!creative_ids || creative_ids.length === 0)) {
      console.log('[run-ads-submit] Loading creatives from DB for draft:', draft_id);

      const { data: dbCreatives, error: creativesError } = await supabase
        .from('ad_creatives')
        .select('id, creative_type, public_url, storage_path')
        .eq('owner_user_id', user.id)
        .eq('draft_id', draft_id)
        .order('created_at', { ascending: true });

      if (creativesError) {
        console.error('[run-ads-submit] Failed to load creatives from DB:', creativesError);
        return {
          statusCode: 400,
          body: JSON.stringify({
            ok: false,
            error: "failed_to_load_creatives",
            details: creativesError.message,
          }),
        };
      }

      if (!dbCreatives || dbCreatives.length === 0) {
        console.error('[run-ads-submit] No creatives found for draft:', draft_id);
        return {
          statusCode: 400,
          body: JSON.stringify({
            ok: false,
            error: "no_creatives_found",
            details: `No creatives found for draft_id: ${draft_id}. User must upload creatives first.`,
            debug: {
              draft_id,
              user_id: user.id,
              checked_table: 'ad_creatives',
            },
          }),
        };
      }

      resolvedCreativeIds = dbCreatives.map(c => c.id);
      console.log('[run-ads-submit] Loaded creatives from DB:', resolvedCreativeIds.length);
    }

    // Final validation: must have at least one creative
    if (!resolvedCreativeIds || resolvedCreativeIds.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "no_creatives",
          details: "At least one creative is required. Provide creative_ids or draft_id with uploaded creatives.",
        }),
      };
    }

    console.log('[run-ads-submit] Building campaign:', {
      ad_goal,
      daily_budget_cents,
      automation_mode,
      creative_count: resolvedCreativeIds.length,
      draft_id: draft_id || 'none',
    });

    const input: RunAdsInput = {
      user_id: user.id,
      ad_goal,
      daily_budget_cents,
      automation_mode,
      creative_ids: resolvedCreativeIds, // Use resolved IDs from DB or payload
      total_budget_cents,
      smart_link_id,
      one_click_link_id,
      platform,
      profile_url,
      capture_page_url,
    };

    const result = await buildAndLaunchCampaign(input);

    if (!result.success) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: result.error || 'campaign_build_failed',
        }),
      };
    }

    console.log('[run-ads-submit] ✅ Campaign launched:', result.campaign_id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        campaign_id: result.campaign_id,
        campaign_type: result.campaign_type,
        reasoning: result.reasoning,
        confidence: result.confidence,
        guardrails_applied: result.guardrails_applied,
      }),
    };
  } catch (e: any) {
    console.error("[run-ads-submit] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "submit_error" }),
    };
  }
};
