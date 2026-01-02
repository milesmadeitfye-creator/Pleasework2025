import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const META_GRAPH_VERSION = 'v21.0';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
    };
  }

  // Validate environment
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[ads-publish] Missing Supabase environment variables');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: 'Server configuration error',
        code: 'CONFIG_ERROR'
      }),
    };
  }

  // Step 1: Verify JWT with auth client (can use anon key)
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const authHeader = event.headers.authorization;
  console.log('[ads-publish] hasAuthHeader:', !!authHeader);

  if (!authHeader?.startsWith('Bearer ')) {
    console.error('[ads-publish] Missing or invalid Authorization header');
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: 'Missing authorization',
        code: 'UNAUTHENTICATED'
      }),
    };
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);

  console.log('[ads-publish] userId:', user?.id);

  if (authError || !user) {
    console.error('[ads-publish] Auth verification failed:', authError?.message);
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: 'Unauthorized',
        code: 'UNAUTHENTICATED'
      }),
    };
  }

  // Step 2: Create admin client for database queries (MUST use service role to bypass RLS)
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

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

    // Step 3: Fetch draft using admin client
    const { data: draft, error: draftError } = await admin
      .from('campaign_drafts')
      .select('*')
      .eq('id', draft_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (draftError || !draft) {
      console.error('[ads-publish] Draft not found:', draftError);
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Draft not found',
          code: 'DRAFT_NOT_FOUND'
        }),
      };
    }

    console.log('[ads-publish] Draft found, fetching Meta credentials...');

    // Step 4: Fetch Meta credentials using admin client (bypasses RLS)
    const { data: metaRow, error: metaError } = await admin
      .from('meta_credentials')
      .select('access_token, ad_account_id, page_id, pixel_id, instagram_actor_id, expires_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('[ads-publish] metaRowFound:', !!metaRow);
    console.log('[ads-publish] metaFields:', {
      hasToken: !!metaRow?.access_token,
      ad: !!metaRow?.ad_account_id,
      page: !!metaRow?.page_id,
      pixel: !!metaRow?.pixel_id,
      ig: !!metaRow?.instagram_actor_id,
    });

    if (metaError) {
      console.error('[ads-publish] Error fetching meta_credentials:', metaError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Database error fetching Meta credentials',
          code: 'DB_ERROR',
          details: metaError
        }),
      };
    }

    if (!metaRow) {
      console.error('[ads-publish] No meta_credentials row found for user');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Meta not connected. Go to Profile → Meta/Facebook & Instagram to connect.',
          code: 'META_NOT_CONNECTED'
        }),
      };
    }

    // Validate required fields
    if (!metaRow.access_token) {
      console.error('[ads-publish] Missing access_token');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Meta access token missing. Please reconnect your Meta account.',
          code: 'MISSING_TOKEN'
        }),
      };
    }

    if (!metaRow.ad_account_id) {
      console.error('[ads-publish] Missing ad_account_id');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'No ad account selected. Go to Profile → Meta/Facebook & Instagram → Configure Assets.',
          code: 'MISSING_AD_ACCOUNT'
        }),
      };
    }

    if (!metaRow.page_id) {
      console.error('[ads-publish] Missing page_id');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'No Facebook page selected. Go to Profile → Meta/Facebook & Instagram → Configure Assets.',
          code: 'MISSING_PAGE'
        }),
      };
    }

    // Check token expiry
    if (metaRow.expires_at) {
      const expiresAt = new Date(metaRow.expires_at);
      if (expiresAt < new Date()) {
        console.error('[ads-publish] Access token expired');
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ok: false,
            error: 'Meta access token expired. Please reconnect your Meta account.',
            code: 'TOKEN_EXPIRED'
          }),
        };
      }
    }

    console.log('[ads-publish] ✅ Meta assets validated:', {
      ad_account_id: metaRow.ad_account_id,
      page_id: metaRow.page_id,
      has_pixel: !!metaRow.pixel_id,
      has_instagram: !!metaRow.instagram_actor_id,
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
      `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${metaRow.ad_account_id}/campaigns`,
      metaRow.access_token,
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
      `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${metaRow.ad_account_id}/adsets`,
      metaRow.access_token,
      adsetPayload
    );

    console.log('[ads-publish] AdSet created:', adsetResult.id);

    const creativePayload: any = {
      name: `${campaignName} - Creative`,
      object_story_spec: {
        page_id: metaRow.page_id,
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
      `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${metaRow.ad_account_id}/adcreatives`,
      metaRow.access_token,
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
      `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${metaRow.ad_account_id}/ads`,
      metaRow.access_token,
      adPayload
    );

    console.log('[ads-publish] Ad created:', adResult.id);

    await admin
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

    // Mark draft as failed using admin client
    if (admin && draft_id) {
      await admin
        .from('campaign_drafts')
        .update({
          status: 'failed',
          error_message: error.message || 'Unknown publish error',
        })
        .eq('id', draft_id);
    }

    // Return detailed error info to help debug
    return {
      statusCode: error.status || 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Internal server error',
        code: error.code || 'PUBLISH_ERROR',
        details: error.meta || undefined,
      }),
    };
  }
};
