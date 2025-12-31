import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { buildAndLaunchCampaign, RunAdsInput } from "./_runAdsCampaignBuilder";
import { resolveDestination } from "./_destinationResolver";

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
      creatives,
      draft_id,
      total_budget_cents,
      smart_link_id,
      smart_link_slug,
      destination_url,
      one_click_link_id,
      platform,
      profile_url,
      capture_page_url,
    } = body;

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

    let resolvedCreativeIds: string[] = [];
    let resolvedCreativeUrls: string[] = [];

    if (creative_ids && creative_ids.length > 0) {
      resolvedCreativeIds = creative_ids;
      console.log('[run-ads-submit] Using creative_ids from body:', resolvedCreativeIds.length);
    } else if (creatives && Array.isArray(creatives) && creatives.length > 0) {
      resolvedCreativeIds = creatives
        .filter((c: any) => c.id)
        .map((c: any) => c.id);
      resolvedCreativeUrls = creatives
        .filter((c: any) => c.url || c.public_url)
        .map((c: any) => c.url || c.public_url);
      console.log('[run-ads-submit] Using creatives array from body:', {
        ids: resolvedCreativeIds.length,
        urls: resolvedCreativeUrls.length,
      });
    }

    if (resolvedCreativeIds.length === 0 && draft_id) {
      console.log('[run-ads-submit] Loading creatives from DB for draft:', draft_id);

      const { data: dbCreatives, error: creativesError } = await supabase
        .from('ad_creatives')
        .select('id, creative_type, public_url, storage_path')
        .eq('owner_user_id', user.id)
        .eq('draft_id', draft_id)
        .order('created_at', { ascending: true });

      if (creativesError) {
        console.error('[run-ads-submit] Failed to load creatives from DB:', creativesError);
      } else if (dbCreatives && dbCreatives.length > 0) {
        resolvedCreativeIds = dbCreatives.map(c => c.id);
        resolvedCreativeUrls = dbCreatives.map(c => c.public_url).filter(Boolean);
        console.log('[run-ads-submit] Loaded creatives from DB:', resolvedCreativeIds.length);
      } else {
        console.warn('[run-ads-submit] No creatives found in DB for draft:', draft_id);
      }
    }

    if (resolvedCreativeIds.length === 0 && resolvedCreativeUrls.length === 0) {
      console.error('[run-ads-submit] No creatives provided', {
        creative_ids_provided: !!creative_ids,
        creatives_provided: !!creatives,
        draft_id_provided: !!draft_id,
        user_id: user.id,
      });

      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "no_creatives_selected",
          details: "At least one creative is required. Upload creatives or provide creative_ids/creatives array.",
          debug: {
            creative_ids_count: creative_ids?.length || 0,
            creatives_count: creatives?.length || 0,
            draft_id,
            user_id: user.id,
          },
        }),
      };
    }

    // Resolve destination URL for all campaign styles
    const destinationResult = await resolveDestination(
      {
        destination_url,
        smart_link_id,
        smart_link_slug,
      },
      user.id,
      supabase
    );

    if (!destinationResult.ok) {
      console.error('[run-ads-submit] Destination resolution failed:', destinationResult.error, destinationResult.debug);
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: destinationResult.error || 'smart_link_not_found',
          details: 'Could not resolve campaign destination URL',
          debug: destinationResult.debug,
        }),
      };
    }

    const resolvedDestinationUrl = destinationResult.url!;
    const resolvedSmartLinkId = destinationResult.smart_link_id || smart_link_id;

    console.log('[run-ads-submit] Building campaign:', {
      ad_goal,
      daily_budget_cents,
      automation_mode,
      creative_count: resolvedCreativeIds.length,
      draft_id: draft_id || 'none',
      destination_url: resolvedDestinationUrl,
      resolution_path: destinationResult.debug?.resolution_path,
    });

    const input: RunAdsInput = {
      user_id: user.id,
      ad_goal,
      daily_budget_cents,
      automation_mode,
      creative_ids: resolvedCreativeIds,
      total_budget_cents,
      smart_link_id: resolvedSmartLinkId,
      one_click_link_id,
      platform,
      profile_url: resolvedDestinationUrl,
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
