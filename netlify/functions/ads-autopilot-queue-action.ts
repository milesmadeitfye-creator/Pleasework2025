import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_supabaseAdmin';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Queue a risky action for human approval.
 * Used by Ghoste AI when it proposes budget increases, activations, etc.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const auth = event.headers.authorization || event.headers.Authorization;
    if (!auth?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'Missing authorization header' }),
      };
    }

    const jwt = auth.replace('Bearer ', '').trim();
    const sb = supabaseAdmin;

    const { data: u, error: ue } = await sb.auth.getUser(jwt);
    if (ue || !u?.user?.id) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'Invalid auth token' }),
      };
    }
    const userId = u.user.id;

    const body = JSON.parse(event.body || '{}');
    const { action_type, payload, reason, risk_level } = body;

    if (!action_type || !payload) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'Missing action_type or payload' }),
      };
    }

    console.log('[ads-autopilot-queue-action] Queuing action:', action_type, 'for user:', userId);

    const { data, error } = await sb
      .from('ads_verification_queue')
      .insert({
        user_id: userId,
        provider: 'meta',
        action_type,
        payload,
        reason: reason ?? null,
        risk_level: risk_level ?? 'high',
        status: 'pending',
        requested_by: 'ghoste',
      })
      .select('*')
      .single();

    if (error) throw error;

    console.log('[ads-autopilot-queue-action] Queued item:', data.id);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, item: data }),
    };
  } catch (e: any) {
    console.error('[ads-autopilot-queue-action] Error:', e);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
    };
  }
};
