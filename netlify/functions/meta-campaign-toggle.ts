import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface ToggleRequest {
  level: 'campaign' | 'adset' | 'ad';
  id: string;
  enabled: boolean;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Missing authorization header' })
    };
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

  // Verify user
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid token' })
    };
  }

  let body: ToggleRequest;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  const { level, id, enabled } = body;

  if (!level || !id || typeof enabled !== 'boolean') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields: level, id, enabled' })
    };
  }

  // Only support campaign level for now (matching ad_campaigns table)
  if (level !== 'campaign') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Only campaign level is currently supported' })
    };
  }

  // Fetch campaign from DB
  const { data: campaign, error: fetchError } = await supabaseClient
    .from('ad_campaigns')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !campaign) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Campaign not found' })
    };
  }

  const newStatus = enabled ? 'active' : 'paused';

  // If no meta_campaign_id, this is a draft - just update DB
  if (!campaign.meta_campaign_id) {
    const { error: updateError } = await supabaseClient
      .from('ad_campaigns')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to update campaign', details: updateError.message })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        status: newStatus,
        draftOnly: true,
        message: 'Campaign status updated (draft only - not synced to Meta)'
      })
    };
  }

  // Load user's Meta credentials
  const { data: metaConn, error: metaError } = await supabaseClient
    .from('meta_connections')
    .select('access_token, ad_account_id')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (metaError || !metaConn || !metaConn.access_token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Meta credentials not found. Please reconnect your Meta account.' })
    };
  }

  // Update Meta campaign status
  const metaStatus = enabled ? 'ACTIVE' : 'PAUSED';
  const metaUrl = `https://graph.facebook.com/v20.0/${campaign.meta_campaign_id}`;

  try {
    const metaResponse = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: metaStatus,
        access_token: metaConn.access_token
      })
    });

    const metaData = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error('[meta-campaign-toggle] Meta API error:', metaData);

      // Update DB with error
      await supabaseClient
        .from('ad_campaigns')
        .update({
          last_error: `Meta API error: ${metaData.error?.message || 'Unknown error'}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to update Meta campaign',
          details: metaData.error?.message || 'Unknown Meta API error'
        })
      };
    }

    // Update DB with success
    const { error: updateError } = await supabaseClient
      .from('ad_campaigns')
      .update({
        status: newStatus,
        last_meta_sync_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('[meta-campaign-toggle] DB update error:', updateError);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        status: newStatus,
        metaStatus,
        message: `Campaign ${enabled ? 'activated' : 'paused'} successfully`,
        syncedToMeta: true
      })
    };
  } catch (error: any) {
    console.error('[meta-campaign-toggle] Exception:', error);

    // Update DB with error
    await supabaseClient
      .from('ad_campaigns')
      .update({
        last_error: `Exception: ${error.message}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to toggle campaign',
        details: error.message
      })
    };
  }
};
