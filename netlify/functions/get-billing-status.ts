import { Handler, HandlerEvent } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing or invalid authorization header' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseAdmin();

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[BILLING_STATUS] Auth error:', authError?.message);
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const { data: subscription, error: subError } = await supabase
      .from('billing_subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (subError) {
      console.error('[BILLING_STATUS] Error fetching subscription:', subError.message);
    }

    let plan: 'pro' | 'free' = 'free';
    let status = 'none';

    if (subscription && subscription.status) {
      status = subscription.status;
      if (['active', 'trialing'].includes(subscription.status)) {
        plan = 'pro';
      }
    }

    console.log('[BILLING_STATUS] User:', user.id, 'Plan:', plan, 'Status:', status);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, status }),
    };
  } catch (error: any) {
    console.error('[BILLING_STATUS] Error:', error?.message || error);
    console.error('[BILLING_STATUS] Stack:', error?.stack);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch billing status' }),
    };
  }
};
