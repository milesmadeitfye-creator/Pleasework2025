import { Handler } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';
import { resolveMetaAssets, validateMetaAssets } from './_resolveMetaAssets';

const META_GRAPH_VERSION = 'v21.0';

interface PublishRequest {
  draft_id: string;
  mode?: 'ACTIVE' | 'PAUSED';
}

interface PublishResponse {
  ok: boolean;
  draft_id: string;
  meta?: {
    campaign_id: string;
    adset_id: string;
    ad_id: string;
  };
  message?: string;
  error?: string;
}

async function metaGraphPost(url: string, accessToken: string, body: any): Promise<any> {
  const u = new URL(url);
  u.searchParams.set('access_token', accessToken);

  const res = await fetch(u.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (res.ok) return json;

  const err = new Error(json?.error?.message || `Meta API error ${res.status}`);
  (err as any).meta = json?.error;
  (err as any).status = res.status;
  throw err;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Database not configured' }),
    };
  }

  const authHeader = event.headers.authorization;
  console.log('[ads-publish] hasAuthHeader:', !!authHeader);

  if (!authHeader?.startsWith('Bearer ')) {
    console.error('[ads-publish] Missing or invalid Authorization header');
    return {
      statusCode: 401,
      body: JSON.stringify({
        ok: false,
        error: 'Missing authorization',
        code: 'UNAUTHENTICATED'
      }),
    };
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  console.log('[ads-publish] userId:', user?.id);

  if (authError || !user) {
    console.error('[ads-publish] Auth verification failed:', authError?.message);
    return {
      statusCode: 401,
      body: JSON.stringify({
        ok: false,
        error: 'Unauthorized',
        code: 'UNAUTHENTICATED'
      }),
    };
  }

  let request: PublishRequest;
  try {
    request = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const { draft_id, mode = 'PAUSED' } = request;

  if (!draft_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'draft_id required' }),
    };
  }

  try {
    console.log(`[ads-publish] Publishing draft ${draft_id} for user ${user.id}`);

    const { data: draft, error: draftError } = await supabase
      .from('campaign_drafts')
      .select('*')
      .eq('id', draft_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (draftError || !draft) {
      console.error('[ads-publish] Draft not found:', draftError);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Draft not found' }),
      };
    }

    console.log('[ads-publish] Resolving Meta assets using canonical resolver...');

    // Use canonical Meta asset resolver (same as manual flow)
    const assets = await resolveMetaAssets(user.id);

    // ✅ DEBUG LOG: Assets resolved
    console.log('[ads-publish] metaAssetsResolved:', {
      hasAssets: !!assets,
      has_required_assets: assets?.has_required_assets,
      ad_account_id: assets?.ad_account_id,
      page_id: assets?.page_id,
      pixel_id: assets?.pixel_id,
      instagram_actor_id: assets?.instagram_actor_id,
    });

    // Validate assets (returns clear error messages)
    const validation = validateMetaAssets(assets, {
      requirePixel: false, // Optional for traffic campaigns
      requireInstagram: false, // Optional
    });

    if (!validation.valid) {
      console.error('[ads-publish] Asset validation failed:', {
        code: validation.code,
        error: validation.error,
      });
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: validation.error,
          code: validation.code,
        }),
      };
    }

    console.log('[ads-publish] ✅ Meta assets validated:', {
      ad_account_id: assets!.ad_account_id,
      page_id: assets!.page_id,
      has_pixel: !!assets!.pixel_id,
      has_instagram: !!assets!.instagram_actor_id,
    });

    console.log('[ads-publish] Creating Meta campaign');

    const campaignName = draft.name || `Campaign ${draft.id.substring(0, 8)}`;
    const dailyBudget = draft.daily_budget_cents || 500;
    const objective = 'OUTCOME_TRAFFIC';
    const destinationUrl = draft.destination_url || 'https://ghoste.one';

    const campaignPayload: any = {
      name: campaignName,
      objective,
      status: mode,
      special_ad_categories: [],
    };

    const campaignResult = await metaGraphPost(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${assets!.ad_account_id}/campaigns`,
      assets!.access_token,
      campaignPayload
    );

    console.log('[ads-publish] Campaign created:', campaignResult.id);

    const adsetPayload: any = {
      name: `${campaignName} - AdSet`,
      campaign_id: campaignResult.id,
      daily_budget: dailyBudget,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      status: mode,
      targeting: {
        geo_locations: {
          countries: draft.countries || ['US'],
        },
        age_min: 18,
        age_max: 65,
      },
    };

    const adsetResult = await metaGraphPost(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${assets!.ad_account_id}/adsets`,
      assets!.access_token,
      adsetPayload
    );

    console.log('[ads-publish] AdSet created:', adsetResult.id);

    const creativePayload: any = {
      name: `${campaignName} - Creative`,
      object_story_spec: {
        page_id: assets!.page_id,
        link_data: {
          link: destinationUrl,
          message: draft.primary_text || 'Check this out!',
          name: draft.headline || campaignName,
          description: draft.description || '',
          call_to_action: {
            type: draft.call_to_action || 'LEARN_MORE',
          },
        },
      },
    };

    const creativeResult = await metaGraphPost(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${assets!.ad_account_id}/adcreatives`,
      assets!.access_token,
      creativePayload
    );

    console.log('[ads-publish] Creative created:', creativeResult.id);

    const adPayload = {
      name: `${campaignName} - Ad`,
      adset_id: adsetResult.id,
      creative: { creative_id: creativeResult.id },
      status: mode,
    };

    const adResult = await metaGraphPost(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${assets!.ad_account_id}/ads`,
      assets!.access_token,
      adPayload
    );

    console.log('[ads-publish] Ad created:', adResult.id);

    await supabase
      .from('campaign_drafts')
      .update({
        status: mode === 'ACTIVE' ? 'launched' : 'approved',
        meta_campaign_id: campaignResult.id,
        meta_adset_id: adsetResult.id,
        meta_ad_id: adResult.id,
        approved_at: new Date().toISOString(),
        launched_at: mode === 'ACTIVE' ? new Date().toISOString() : null,
      })
      .eq('id', draft_id);

    const response: PublishResponse = {
      ok: true,
      draft_id,
      meta: {
        campaign_id: campaignResult.id,
        adset_id: adsetResult.id,
        ad_id: adResult.id,
      },
      message: mode === 'ACTIVE' ? 'Published to Meta and activated!' : 'Published to Meta (paused)',
    };

    console.log('[ads-publish] Publish completed:', response);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('[ads-publish] Publish error:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      status: error.status,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    });

    await supabase
      .from('campaign_drafts')
      .update({
        status: 'failed',
        error_message: error.message || 'Unknown publish error',
      })
      .eq('id', draft_id);

    // Return detailed error info to help debug
    return {
      statusCode: error.status || 500,
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Internal server error',
        code: error.code || 'PUBLISH_ERROR',
        details: error.meta || undefined,
      }),
    };
  }
};
