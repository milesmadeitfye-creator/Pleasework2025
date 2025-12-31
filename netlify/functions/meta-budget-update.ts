import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface BudgetUpdateRequest {
  level: 'campaign' | 'adset';
  id: string;
  budget_type: 'daily' | 'lifetime';
  amount: number; // in cents
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

  let body: BudgetUpdateRequest;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  const { level, id, budget_type, amount } = body;

  if (!level || !id || !budget_type || typeof amount !== 'number') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields: level, id, budget_type, amount' })
    };
  }

  if (amount <= 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Budget amount must be greater than 0' })
    };
  }

  // Only support campaign level for now
  if (level !== 'campaign') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Only campaign level is currently supported' })
    };
  }

  // Fetch campaign
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

  // Update DB budget immediately
  const budgetField = budget_type === 'daily' ? 'daily_budget_cents' : 'lifetime_budget_cents';
  const updateData: any = {
    [budgetField]: amount,
    updated_at: new Date().toISOString()
  };

  const { error: updateError } = await supabaseClient
    .from('ad_campaigns')
    .update(updateData)
    .eq('id', id);

  if (updateError) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update budget in database', details: updateError.message })
    };
  }

  // If no meta_adset_id, this is a draft - return success
  if (!campaign.meta_adset_id) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        budget_type,
        amount,
        draftOnly: true,
        message: 'Budget updated (draft only - will be applied when published to Meta)'
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
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        budget_type,
        amount,
        draftOnly: true,
        message: 'Budget updated in DB. Meta credentials not found - reconnect to sync.'
      })
    };
  }

  // Update Meta adset budget
  // Note: Budget is typically set at adset level for Meta ads
  const metaUrl = `https://graph.facebook.com/v20.0/${campaign.meta_adset_id}`;
  const metaBudgetField = budget_type === 'daily' ? 'daily_budget' : 'lifetime_budget';

  try {
    const metaResponse = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        [metaBudgetField]: amount,
        access_token: metaConn.access_token
      })
    });

    const metaData = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error('[meta-budget-update] Meta API error:', metaData);

      // Update DB with error but keep new budget value
      await supabaseClient
        .from('ad_campaigns')
        .update({
          last_error: `Meta budget update error: ${metaData.error?.message || 'Unknown error'}`
        })
        .eq('id', id);

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to update Meta budget',
          details: metaData.error?.message || 'Unknown Meta API error',
          dbUpdated: true,
          message: 'Budget updated in database but failed to sync to Meta'
        })
      };
    }

    // Update DB with success
    await supabaseClient
      .from('ad_campaigns')
      .update({
        last_meta_sync_at: new Date().toISOString(),
        last_error: null
      })
      .eq('id', id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        budget_type,
        amount,
        syncedToMeta: true,
        message: 'Budget updated successfully and synced to Meta'
      })
    };
  } catch (error: any) {
    console.error('[meta-budget-update] Exception:', error);

    // Update DB with error
    await supabaseClient
      .from('ad_campaigns')
      .update({
        last_error: `Exception: ${error.message}`
      })
      .eq('id', id);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to update budget',
        details: error.message,
        dbUpdated: true
      })
    };
  }
};
