import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { buildAndLaunchCampaign, RunAdsInput } from "./_runAdsCampaignBuilder";

function extractSmartLinkSlug(url: string | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/l\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

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
