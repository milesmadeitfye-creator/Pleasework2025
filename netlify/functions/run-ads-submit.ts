import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { buildAndLaunchCampaign, RunAdsInput } from "./_runAdsCampaignBuilder";
import { recordAdsOperation } from "./_utils/recordAdsOperation";
import { executeMetaCampaign } from "./_metaCampaignExecutor";

function extractSmartLinkSlug(url: string | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/l\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Normalize confidence value from string/number to separate score and label
 * Handles AI responses that return "low"/"medium"/"high" strings
 */
function normalizeConfidence(conf: any): { score: number | null; label: string | null } {
  // If already a valid number, use it as score
  if (typeof conf === "number" && Number.isFinite(conf)) {
    return { score: conf, label: null };
  }

  // If string, map to numeric score
  const label = typeof conf === "string" ? conf.toLowerCase() : null;
  const map: Record<string, number> = {
    low: 0.3,
    medium: 0.6,
    high: 0.9,
  };

  return {
    score: label && map[label] ? map[label] : null,
    label: label || null,
  };
}

export const handler: Handler = async (event) => {
  const startTime = Date.now();
  let requestBody: any = null;
  let responseData: any = null;
  let statusCode = 500;
  let userId: string | undefined = undefined;

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

  userId = user.id;

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    requestBody = body;

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
      mode = 'draft',
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

    // Log submit start
    console.log('[run-ads-submit] Submit started:', {
      draft_id: draft_id || 'none',
      has_smart_link_id: !!smart_link_id,
      has_smart_link_slug: !!smart_link_slug,
      has_destination_url: !!destination_url,
    });

    // Resolve smart link with clear priority: id → slug → extracted slug
    let smartLink: any = null;
    let resolutionMethod: string = 'none';
    const extractedSlug = extractSmartLinkSlug(destination_url);

    // Priority 1: smart_link_id
    if (smart_link_id) {
      console.log('[run-ads-submit] Attempting lookup by smart_link_id:', smart_link_id);
      const { data, error } = await supabase
        .from('smart_links')
        .select('id, slug, destination_url, user_id, owner_user_id')
        .eq('id', smart_link_id)
        .maybeSingle();

      if (!error && data) {
        smartLink = data;
        resolutionMethod = 'smart_link_id';
      }
    }

    // Priority 2: smart_link_slug
    if (!smartLink && smart_link_slug) {
      console.log('[run-ads-submit] Attempting lookup by smart_link_slug:', smart_link_slug);
      const { data, error } = await supabase
        .from('smart_links')
        .select('id, slug, destination_url, user_id, owner_user_id')
        .eq('slug', smart_link_slug)
        .maybeSingle();

      if (!error && data) {
        smartLink = data;
        resolutionMethod = 'smart_link_slug';
      }
    }

    // Priority 3: extracted slug from destination_url
    if (!smartLink && extractedSlug) {
      console.log('[run-ads-submit] Attempting lookup by extracted slug:', extractedSlug);
      const { data, error } = await supabase
        .from('smart_links')
        .select('id, slug, destination_url, user_id, owner_user_id')
        .eq('slug', extractedSlug)
        .maybeSingle();

      if (!error && data) {
        smartLink = data;
        resolutionMethod = 'extracted_slug';
      }
    }

    // Priority 4: Create smart link if not found (never block ad submission)
    if (!smartLink && destination_url) {
      console.log('[run-ads-submit] Smart link not found, attempting to create...');

      try {
        const newSlug = smart_link_slug || extractedSlug || `campaign-${Date.now()}`;
        const newId = smart_link_id || crypto.randomUUID();

        const insertPayload = {
          id: newId,
          slug: newSlug,
          destination_url: destination_url,
          owner_user_id: user.id,
          title: 'Campaign Link',
          created_at: new Date().toISOString(),
        };

        // Try smart_links table first
        let { data: created, error: createError } = await supabase
          .from('smart_links')
          .insert(insertPayload)
          .select('id, slug, destination_url, owner_user_id')
          .maybeSingle();

        // Try smartlinks table if smart_links fails
        if (createError && createError.code === '42P01') {
          const result = await supabase
            .from('smartlinks')
            .insert(insertPayload)
            .select('id, slug, destination_url, owner_user_id')
            .maybeSingle();
          created = result.data;
          createError = result.error;
        }

        if (!createError && created) {
          smartLink = created;
          resolutionMethod = 'created';
          console.log('[run-ads-submit] ✓ Smart link created:', { id: created.id, slug: created.slug });
        } else {
          console.warn('[run-ads-submit] Failed to create smart link, continuing with destination_url only:', createError?.message);
          resolutionMethod = 'fallback_destination_url';
        }
      } catch (createErr: any) {
        console.warn('[run-ads-submit] Exception creating smart link, continuing:', createErr.message);
        resolutionMethod = 'fallback_destination_url';
      }
    }

    // Verify ownership if smart link was found/created
    if (smartLink) {
      const linkOwner = smartLink.owner_user_id || smartLink.user_id;
      if (linkOwner && linkOwner !== user.id) {
        console.error('[run-ads-submit] Smart link ownership mismatch', {
          link_owner: linkOwner,
          user_id: user.id,
        });

        return {
          statusCode: 403,
          body: JSON.stringify({
            ok: false,
            error: 'Smart link does not belong to user',
          }),
        };
      }
    }

    // Build destination URL (handle fallback case)
    const resolvedDestinationUrl = smartLink?.slug
      ? `https://ghoste.one/l/${smartLink.slug}`
      : (destination_url || smartLink?.destination_url || '');

    if (!resolvedDestinationUrl) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: 'Missing destination URL',
          details: 'No destination_url provided and smart link resolution failed',
        }),
      };
    }

    console.log('[run-ads-submit] ✓ Smart link resolved:', {
      method: resolutionMethod,
      slug: smartLink?.slug || 'none',
      destination: resolvedDestinationUrl,
      smart_link_id: smartLink?.id || 'null',
    });

    console.log('[run-ads-submit] Building campaign:', {
      ad_goal,
      daily_budget_cents,
      automation_mode,
      creative_count: resolvedCreativeIds.length,
      draft_id: draft_id || 'none',
      destination_url: resolvedDestinationUrl,
    });

    console.log('[run-ads-submit] Final destination URL computed:', resolvedDestinationUrl);

    const input: RunAdsInput = {
      user_id: user.id,
      ad_goal,
      daily_budget_cents,
      automation_mode,
      creative_ids: resolvedCreativeIds,
      total_budget_cents,
      smart_link_id: smartLink?.id,
      one_click_link_id,
      platform,
      profile_url: resolvedDestinationUrl,
      capture_page_url,
    };

    const result = await buildAndLaunchCampaign(input);

    if (!result.success) {
      console.error('[run-ads-submit] Campaign build failed:', {
        error: result.error,
        error_code: result.error_code,
      });

      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: result.error || 'campaign_build_failed',
          code: result.error_code,
        }),
      };
    }

    console.log('[run-ads-submit] ✅ Campaign analysis complete:', result.campaign_id);

    // Step: INSERT into ad_campaigns (canonical source of truth)
    const campaignStatus = mode === 'publish' ? 'publishing' : 'draft';

    // Normalize confidence from string ("low"/"medium"/"high") to numeric + label
    const rawConfidence = result?.confidence;
    const { score: confidence_score, label: confidence_label } = normalizeConfidence(rawConfidence);

    console.log('[run-ads-submit] Normalized confidence:', {
      rawConfidence,
      confidence_score,
      confidence_label,
    });

    const insertPayload: any = {
      user_id: user.id,
      draft_id,
      ad_goal,
      campaign_type: result.campaign_type,
      automation_mode,
      status: campaignStatus,
      smart_link_id: smartLink?.id,
      smart_link_slug: smartLink?.slug,
      destination_url: resolvedDestinationUrl,
      daily_budget_cents,
      total_budget_cents,
      creative_ids: resolvedCreativeIds,
      reasoning: result.reasoning,
      confidence: confidence_score, // numeric column - use score, not string
      confidence_score, // explicit numeric score column (if exists)
      confidence_label, // explicit label column (if exists)
      guardrails_applied: result.guardrails_applied,
    };

    // Defensive: ensure no string confidence values
    if (typeof insertPayload.confidence === 'string') {
      console.warn('[run-ads-submit] GUARD: confidence was string, converting to numeric');
      const normalized = normalizeConfidence(insertPayload.confidence);
      insertPayload.confidence = normalized.score;
      insertPayload.confidence_label = normalized.label;
    }

    console.log('[run-ads-submit] Inserting ad_campaigns row:', {
      user_id: user.id,
      keys: Object.keys(insertPayload),
      creative_ids_count: resolvedCreativeIds.length,
      status: campaignStatus,
      confidence_score,
      confidence_label,
    });

    const { data: campaign, error: insertError } = await supabase
      .from('ad_campaigns')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError || !campaign) {
      console.error('[run-ads-submit] Failed to insert campaign:', {
        code: insertError?.code,
        message: insertError?.message,
        details: insertError?.details,
        hint: insertError?.hint,
        payload_keys: Object.keys(insertPayload),
      });

      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: 'Failed to create campaign record',
          detail: {
            code: insertError?.code,
            message: insertError?.message,
            details: insertError?.details,
            hint: insertError?.hint,
          },
        }),
      };
    }

    const ghosteCampaignId = campaign.id;
    console.log('[run-ads-submit] ✅ Campaign saved to DB:', {
      id: ghosteCampaignId,
      status: campaign.status,
      confidence_score: campaign.confidence_score || campaign.confidence,
      confidence_label: campaign.confidence_label,
    });

    // If mode is draft, return immediately
    if (mode !== 'publish') {
      statusCode = 200;
      responseData = {
        ok: true,
        campaign_id: ghosteCampaignId,
        campaign_type: result.campaign_type,
        reasoning: result.reasoning,
        confidence: confidence_score, // Return numeric score
        confidence_label: confidence_label, // Return label separately
        guardrails_applied: result.guardrails_applied,
        status: 'draft',
      };

      await recordAdsOperation({
        label: 'saveDraft',
        request: requestBody,
        response: responseData,
        status: statusCode,
        ok: true,
        userId,
        authHeader,
      });

      return {
        statusCode,
        body: JSON.stringify(responseData),
      };
    }

    // Mode is "publish" - execute Meta campaign creation
    console.log('[run-ads-submit] Mode is publish, executing Meta campaign...');

    // Record publish attempt start
    await recordAdsOperation({
      label: 'publish_start',
      request: requestBody,
      response: { campaign_id: ghosteCampaignId, stage: 'starting_meta_publish' },
      status: 200,
      ok: true,
      userId,
      authHeader,
    });

    const metaResult = await executeMetaCampaign({
      user_id: user.id,
      campaign_id: ghosteCampaignId,
      ad_goal,
      daily_budget_cents,
      destination_url: resolvedDestinationUrl,
      creative_ids: resolvedCreativeIds,
      creative_urls: resolvedCreativeUrls,
    });

    if (!metaResult.success) {
      // Update campaign status to failed
      await supabase
        .from('ad_campaigns')
        .update({
          status: 'failed',
          last_error: metaResult.error || 'Meta execution failed',
          meta_campaign_id: metaResult.meta_campaign_id || null,
          meta_adset_id: metaResult.meta_adset_id || null,
        })
        .eq('id', ghosteCampaignId);

      statusCode = 400;
      responseData = {
        ok: false,
        campaign_id: ghosteCampaignId,
        error: metaResult.error || 'Meta execution failed',
        meta_campaign_id: metaResult.meta_campaign_id,
        stage: 'publish_failed',
      };

      await recordAdsOperation({
        label: 'publish_failed',
        request: requestBody,
        response: responseData,
        status: statusCode,
        ok: false,
        error: metaResult.error,
        userId,
        authHeader,
      });

      return {
        statusCode,
        body: JSON.stringify(responseData),
      };
    }

    // Success - update campaign with Meta IDs
    await supabase
      .from('ad_campaigns')
      .update({
        status: 'published',
        meta_campaign_id: metaResult.meta_campaign_id,
        meta_adset_id: metaResult.meta_adset_id,
        meta_ad_id: metaResult.meta_ad_id,
        last_error: null,
      })
      .eq('id', ghosteCampaignId);

    console.log('[run-ads-submit] ✅ Campaign published to Meta:', {
      ghoste_id: ghosteCampaignId,
      meta_campaign_id: metaResult.meta_campaign_id,
      meta_adset_id: metaResult.meta_adset_id,
      meta_ad_id: metaResult.meta_ad_id,
    });

    statusCode = 200;
    responseData = {
      ok: true,
      campaign_id: ghosteCampaignId,
      campaign_type: result.campaign_type,
      reasoning: result.reasoning,
      confidence: confidence_score, // Return numeric score
      confidence_label: confidence_label, // Return label separately
      guardrails_applied: result.guardrails_applied,
      status: 'published',
      meta_campaign_id: metaResult.meta_campaign_id,
      meta_adset_id: metaResult.meta_adset_id,
      meta_ad_id: metaResult.meta_ad_id,
    };

    // Record successful publish operation
    await recordAdsOperation({
      label: 'publish_success',
      request: requestBody,
      response: responseData,
      status: statusCode,
      ok: true,
      userId,
      authHeader,
    });

    return {
      statusCode,
      body: JSON.stringify(responseData),
    };
  } catch (e: any) {
    console.error("[run-ads-submit] Error:", e.message);

    statusCode = 500;
    responseData = { ok: false, error: e.message || "submit_error" };

    // Record error operation
    await recordAdsOperation({
      label: 'publish',
      request: requestBody,
      response: responseData,
      status: statusCode,
      ok: false,
      error: e.message || "submit_error",
      userId,
      authHeader,
    });

    return {
      statusCode,
      body: JSON.stringify(responseData),
    };
  }
};
