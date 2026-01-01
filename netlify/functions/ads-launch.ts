import { Handler } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';
import { getMetaCredentials } from './_metaCredentialsHelper';
import { metaGraphGet } from './_metaGraph';

interface LaunchRequest {
  campaign_id: string;
  mode?: 'ACTIVE' | 'SCHEDULED' | 'PAUSED';
  start_time?: string;
}

interface LaunchResponse {
  ok: boolean;
  campaign_id: string;
  lifecycle_state: string;
  meta_status?: {
    campaign: any;
    adset: any;
    ad: any;
  };
  needs_poll?: boolean;
  error?: string;
  code?: string;
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
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Missing authorization' }),
    };
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  let request: LaunchRequest;
  try {
    request = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const { campaign_id, mode = 'ACTIVE' } = request;

  if (!campaign_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'campaign_id required' }),
    };
  }

  try {
    console.log(`[ads-launch] Starting launch for campaign ${campaign_id} by user ${user.id}`);

    const { data: campaign, error: campaignError } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (campaignError || !campaign) {
      console.error('[ads-launch] Campaign not found:', campaignError);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Campaign not found' }),
      };
    }

    if (!campaign.meta_campaign_id || !campaign.meta_adset_id || !campaign.meta_ad_id) {
      console.error('[ads-launch] Missing Meta IDs:', {
        meta_campaign_id: campaign.meta_campaign_id,
        meta_adset_id: campaign.meta_adset_id,
        meta_ad_id: campaign.meta_ad_id,
      });

      await supabase
        .from('ad_campaigns')
        .update({
          lifecycle_state: 'failed',
          last_launch_error: 'Missing Meta campaign/adset/ad IDs. Please publish first.',
        })
        .eq('id', campaign_id);

      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          code: 'MISSING_META_IDS',
          error: 'Campaign has not been published to Meta yet',
        }),
      };
    }

    const credentials = await getMetaCredentials(user.id);

    await supabase
      .from('ad_campaigns')
      .update({
        lifecycle_state: 'launching',
        launch_requested_at: new Date().toISOString(),
        launch_attempts: (campaign.launch_attempts || 0) + 1,
        last_launch_error: null,
      })
      .eq('id', campaign_id);

    console.log('[ads-launch] Set lifecycle_state to launching');

    const targetStatus = mode === 'PAUSED' ? 'PAUSED' : 'ACTIVE';
    const statuses: any = {};

    try {
      console.log(`[ads-launch] Setting campaign ${campaign.meta_campaign_id} to ${targetStatus}`);
      const campaignResult = await metaGraphPost(
        `https://graph.facebook.com/v21.0/${campaign.meta_campaign_id}`,
        credentials.accessToken,
        { status: targetStatus }
      );
      statuses.campaign = campaignResult;

      console.log(`[ads-launch] Setting adset ${campaign.meta_adset_id} to ${targetStatus}`);
      const adsetResult = await metaGraphPost(
        `https://graph.facebook.com/v21.0/${campaign.meta_adset_id}`,
        credentials.accessToken,
        { status: targetStatus }
      );
      statuses.adset = adsetResult;

      console.log(`[ads-launch] Setting ad ${campaign.meta_ad_id} to ${targetStatus}`);
      const adResult = await metaGraphPost(
        `https://graph.facebook.com/v21.0/${campaign.meta_ad_id}`,
        credentials.accessToken,
        { status: targetStatus }
      );
      statuses.ad = adResult;

      console.log('[ads-launch] All status updates sent successfully');
    } catch (error: any) {
      console.error('[ads-launch] Failed to update Meta statuses:', error);

      await supabase
        .from('ad_campaigns')
        .update({
          lifecycle_state: 'failed',
          last_launch_error: error.message || 'Failed to activate campaign in Meta',
        })
        .eq('id', campaign_id);

      await supabase.from('meta_launch_logs').insert({
        campaign_id,
        user_id: user.id,
        stage: 'launch',
        request: { campaign_id, mode, meta_ids: { campaign: campaign.meta_campaign_id, adset: campaign.meta_adset_id, ad: campaign.meta_ad_id } },
        response: null,
        meta_statuses: statuses,
        ok: false,
        error: error.message,
      });

      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          campaign_id,
          lifecycle_state: 'failed',
          error: error.message,
        }),
      };
    }

    await new Promise((r) => setTimeout(r, 2000));

    const finalStatuses: any = {};
    try {
      const campaignStatus = await metaGraphGet(
        `https://graph.facebook.com/v21.0/${campaign.meta_campaign_id}?fields=status,effective_status`,
        credentials.accessToken
      );
      finalStatuses.campaign = campaignStatus;

      const adsetStatus = await metaGraphGet(
        `https://graph.facebook.com/v21.0/${campaign.meta_adset_id}?fields=status,effective_status`,
        credentials.accessToken
      );
      finalStatuses.adset = adsetStatus;

      const adStatus = await metaGraphGet(
        `https://graph.facebook.com/v21.0/${campaign.meta_ad_id}?fields=status,effective_status`,
        credentials.accessToken
      );
      finalStatuses.ad = adStatus;

      console.log('[ads-launch] Fetched final statuses:', finalStatuses);
    } catch (error: any) {
      console.error('[ads-launch] Failed to fetch verification statuses:', error);

      await supabase.from('meta_launch_logs').insert({
        campaign_id,
        user_id: user.id,
        stage: 'launch',
        request: { campaign_id, mode },
        response: statuses,
        meta_statuses: finalStatuses,
        ok: false,
        error: `Verification failed: ${error.message}`,
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          campaign_id,
          lifecycle_state: 'launching',
          needs_poll: true,
          error: 'Status update sent but verification pending',
        }),
      };
    }

    const allActive =
      finalStatuses.campaign?.effective_status === 'ACTIVE' &&
      finalStatuses.adset?.effective_status === 'ACTIVE' &&
      finalStatuses.ad?.effective_status === 'ACTIVE';

    const allPaused =
      finalStatuses.campaign?.status === 'PAUSED' &&
      finalStatuses.adset?.status === 'PAUSED' &&
      finalStatuses.ad?.status === 'PAUSED';

    let finalLifecycleState = 'launching';
    if (allActive) {
      finalLifecycleState = 'active';
    } else if (allPaused) {
      finalLifecycleState = 'paused';
    } else if (mode === 'SCHEDULED') {
      finalLifecycleState = 'scheduled';
    }

    const needsPoll = finalLifecycleState === 'launching';

    await supabase
      .from('ad_campaigns')
      .update({
        lifecycle_state: finalLifecycleState,
        last_meta_sync_at: new Date().toISOString(),
        last_meta_status: finalStatuses,
        launch_confirmed_at: allActive ? new Date().toISOString() : null,
      })
      .eq('id', campaign_id);

    await supabase.from('meta_launch_logs').insert({
      campaign_id,
      user_id: user.id,
      stage: 'launch',
      request: { campaign_id, mode },
      response: statuses,
      meta_statuses: finalStatuses,
      ok: true,
      error: null,
    });

    const response: LaunchResponse = {
      ok: true,
      campaign_id,
      lifecycle_state: finalLifecycleState,
      meta_status: finalStatuses,
      needs_poll: needsPoll,
    };

    console.log('[ads-launch] Launch completed:', response);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('[ads-launch] Unexpected error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
};
