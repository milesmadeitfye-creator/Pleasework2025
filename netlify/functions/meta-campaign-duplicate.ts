import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface DuplicateRequest {
  campaign_id: string;
  mode?: 'draft' | 'meta';
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

  let body: DuplicateRequest;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  const { campaign_id, mode = 'draft' } = body;

  if (!campaign_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required field: campaign_id' })
    };
  }

  // Fetch original campaign
  const { data: originalCampaign, error: fetchError } = await supabaseClient
    .from('ad_campaigns')
    .select('*')
    .eq('id', campaign_id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !originalCampaign) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Campaign not found' })
    };
  }

  // Create duplicate in DB (draft mode)
  const duplicateData = {
    user_id: user.id,
    name: `${originalCampaign.name || 'Campaign'} (Copy)`,
    status: 'draft',
    ad_goal: originalCampaign.ad_goal,
    campaign_type: originalCampaign.campaign_type,
    automation_mode: originalCampaign.automation_mode,
    smart_link_id: originalCampaign.smart_link_id,
    smart_link_slug: originalCampaign.smart_link_slug,
    destination_url: originalCampaign.destination_url,
    daily_budget_cents: originalCampaign.daily_budget_cents,
    total_budget_cents: originalCampaign.total_budget_cents,
    lifetime_budget_cents: originalCampaign.lifetime_budget_cents,
    creative_ids: originalCampaign.creative_ids,
    reasoning: originalCampaign.reasoning,
    confidence: originalCampaign.confidence,
    guardrails_applied: originalCampaign.guardrails_applied,
    // Reset Meta fields for draft
    meta_campaign_id: null,
    meta_adset_id: null,
    meta_ad_id: null,
    last_error: null,
    last_meta_sync_at: null
  };

  const { data: newCampaign, error: insertError } = await supabaseClient
    .from('ad_campaigns')
    .insert(duplicateData)
    .select()
    .single();

  if (insertError || !newCampaign) {
    console.error('[meta-campaign-duplicate] Insert error:', insertError);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to create duplicate campaign',
        details: insertError?.message
      })
    };
  }

  // If mode is 'meta' and original has meta_campaign_id, we could implement Meta duplication
  // For now, always return draft mode (user can publish later via Run Ads flow)
  if (mode === 'meta' && originalCampaign.meta_campaign_id) {
    console.log('[meta-campaign-duplicate] Meta mode requested but not yet implemented - created draft');
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      campaign: {
        id: newCampaign.id,
        name: newCampaign.name,
        status: newCampaign.status
      },
      mode: 'draft',
      message: 'Campaign duplicated successfully as draft. Use "Run Ads" to publish to Meta.'
    })
  };
};
