import { Handler } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';
import { getMetaCredentials } from './_metaCredentialsHelper';
import { metaGraphGet } from './_metaGraph';

interface SyncRequest {
  campaign_id?: string;
  bundle_id?: string;
}

interface SyncResponse {
  ok: boolean;
  synced: number;
  campaigns: Array<{
    campaign_id: string;
    lifecycle_state: string;
    meta_status: any;
  }>;
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

  let request: SyncRequest;
  try {
    request = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const { campaign_id, bundle_id } = request;

  try {
    console.log(`[ads-sync-status] Syncing for user ${user.id}, campaign: ${campaign_id}, bundle: ${bundle_id}`);

    let query = supabase
      .from('ad_campaigns')
      .select('*')
      .eq('user_id', user.id)
      .not('meta_campaign_id', 'is', null);

    if (campaign_id) {
      query = query.eq('id', campaign_id);
    } else if (bundle_id) {
      query = query.eq('bundle_id', bundle_id);
    } else {
      query = query.in('lifecycle_state', ['launching', 'active', 'paused']);
    }

    const { data: campaigns, error: campaignsError } = await query;

    if (campaignsError) {
      console.error('[ads-sync-status] Query error:', campaignsError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch campaigns' }),
      };
    }

    if (!campaigns || campaigns.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          synced: 0,
          campaigns: [],
        }),
      };
    }

    const credentials = await getMetaCredentials(user.id);
    const results: any[] = [];

    for (const campaign of campaigns) {
      try {
        console.log(`[ads-sync-status] Syncing campaign ${campaign.id}`);

        if (!campaign.meta_campaign_id || !campaign.meta_adset_id || !campaign.meta_ad_id) {
          console.warn(`[ads-sync-status] Skipping campaign ${campaign.id} - missing Meta IDs`);
          continue;
        }

        const metaStatuses: any = {};

        try {
          const campaignStatus = await metaGraphGet(
            `https://graph.facebook.com/v21.0/${campaign.meta_campaign_id}?fields=status,effective_status`,
            credentials.accessToken
          );
          metaStatuses.campaign = campaignStatus;
        } catch (error: any) {
          console.error(`[ads-sync-status] Failed to fetch campaign status:`, error);
          metaStatuses.campaign = { error: error.message };
        }

        try {
          const adsetStatus = await metaGraphGet(
            `https://graph.facebook.com/v21.0/${campaign.meta_adset_id}?fields=status,effective_status`,
            credentials.accessToken
          );
          metaStatuses.adset = adsetStatus;
        } catch (error: any) {
          console.error(`[ads-sync-status] Failed to fetch adset status:`, error);
          metaStatuses.adset = { error: error.message };
        }

        try {
          const adStatus = await metaGraphGet(
            `https://graph.facebook.com/v21.0/${campaign.meta_ad_id}?fields=status,effective_status`,
            credentials.accessToken
          );
          metaStatuses.ad = adStatus;
        } catch (error: any) {
          console.error(`[ads-sync-status] Failed to fetch ad status:`, error);
          metaStatuses.ad = { error: error.message };
        }

        console.log(`[ads-sync-status] Fetched statuses for ${campaign.id}:`, metaStatuses);

        const allActive =
          metaStatuses.campaign?.effective_status === 'ACTIVE' &&
          metaStatuses.adset?.effective_status === 'ACTIVE' &&
          metaStatuses.ad?.effective_status === 'ACTIVE';

        const allPaused =
          metaStatuses.campaign?.status === 'PAUSED' &&
          metaStatuses.adset?.status === 'PAUSED' &&
          metaStatuses.ad?.status === 'PAUSED';

        const hasErrors =
          metaStatuses.campaign?.error ||
          metaStatuses.adset?.error ||
          metaStatuses.ad?.error;

        let newLifecycleState = campaign.lifecycle_state;

        if (hasErrors) {
          newLifecycleState = 'failed';
        } else if (allActive) {
          newLifecycleState = 'active';
        } else if (allPaused) {
          newLifecycleState = 'paused';
        } else if (campaign.lifecycle_state === 'launching') {
          newLifecycleState = 'launching';
        }

        const updates: any = {
          last_meta_sync_at: new Date().toISOString(),
          last_meta_status: metaStatuses,
        };

        if (newLifecycleState !== campaign.lifecycle_state) {
          updates.lifecycle_state = newLifecycleState;
          console.log(`[ads-sync-status] Lifecycle state changed: ${campaign.lifecycle_state} -> ${newLifecycleState}`);
        }

        if (allActive && !campaign.launch_confirmed_at) {
          updates.launch_confirmed_at = new Date().toISOString();
        }

        if (hasErrors) {
          const errors = [
            metaStatuses.campaign?.error,
            metaStatuses.adset?.error,
            metaStatuses.ad?.error,
          ].filter(Boolean);
          updates.last_launch_error = errors.join('; ');
        }

        await supabase
          .from('ad_campaigns')
          .update(updates)
          .eq('id', campaign.id);

        await supabase.from('meta_launch_logs').insert({
          campaign_id: campaign.id,
          user_id: user.id,
          stage: 'sync',
          request: { campaign_id: campaign.id },
          response: null,
          meta_statuses: metaStatuses,
          ok: !hasErrors,
          error: hasErrors ? updates.last_launch_error : null,
        });

        results.push({
          campaign_id: campaign.id,
          lifecycle_state: newLifecycleState,
          meta_status: metaStatuses,
        });
      } catch (error: any) {
        console.error(`[ads-sync-status] Error syncing campaign ${campaign.id}:`, error);
        results.push({
          campaign_id: campaign.id,
          lifecycle_state: 'failed',
          error: error.message,
        });
      }
    }

    const response: SyncResponse = {
      ok: true,
      synced: results.length,
      campaigns: results,
    };

    console.log(`[ads-sync-status] Sync completed: ${results.length} campaigns`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('[ads-sync-status] Unexpected error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
};
