import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_supabaseAdmin';
import { getMetaCredsForUser, metaPost } from './_metaAutopilotClient';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Approve or reject a queued action.
 * If approved, execute the action immediately.
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
    const { queue_id, decision } = body;

    if (!queue_id || !decision) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'Missing queue_id or decision' }),
      };
    }

    console.log('[ads-autopilot-approve] Processing decision:', decision, 'for queue item:', queue_id);

    // Fetch queue item
    const { data: item, error: ie } = await sb
      .from('ads_verification_queue')
      .select('*')
      .eq('id', queue_id)
      .eq('user_id', userId)
      .single();

    if (ie) throw ie;

    if (item.status !== 'pending') {
      console.log('[ads-autopilot-approve] Item not pending, status:', item.status);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ ok: true, skipped: true, reason: 'not_pending', status: item.status }),
      };
    }

    // Reject
    if (decision === 'reject') {
      await sb
        .from('ads_verification_queue')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', queue_id)
        .eq('user_id', userId);

      console.log('[ads-autopilot-approve] Rejected item:', queue_id);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ ok: true, status: 'rejected' }),
      };
    }

    // Approve and execute
    const creds = await getMetaCredsForUser(userId);

    // payload schema: { path: "<graph_id_or_edge>", method: "POST", body: {...}, entity_type, entity_id, action_taken }
    const payload = item.payload || {};
    const path = payload.path;
    const postBody = payload.body || {};
    const entityType = payload.entity_type || 'adset';
    const entityId = payload.entity_id || path;
    const actionTaken = payload.action_taken || item.action_type;

    console.log('[ads-autopilot-approve] Executing approved action:', actionTaken, 'on', entityId);

    try {
      const resp = await metaPost<any>(creds.accessToken, path, postBody);

      await sb
        .from('ads_verification_queue')
        .update({ status: 'executed', reviewed_at: new Date().toISOString() })
        .eq('id', queue_id)
        .eq('user_id', userId);

      await sb.from('ads_autopilot_log').insert({
        user_id: userId,
        provider: 'meta',
        entity_type: entityType,
        entity_id: String(entityId),
        action_taken: String(actionTaken),
        result: 'ok',
        before: null,
        after: postBody,
        meta: { meta_response: resp, approved: true },
      });

      console.log('[ads-autopilot-approve] Successfully executed action');

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ ok: true, status: 'executed' }),
      };
    } catch (e: any) {
      console.error('[ads-autopilot-approve] Execution failed:', e);

      await sb
        .from('ads_verification_queue')
        .update({ status: 'failed', reviewed_at: new Date().toISOString() })
        .eq('id', queue_id)
        .eq('user_id', userId);

      await sb.from('ads_autopilot_log').insert({
        user_id: userId,
        provider: 'meta',
        entity_type: entityType,
        entity_id: String(entityId),
        action_taken: String(actionTaken),
        result: 'failed',
        before: null,
        after: postBody,
        meta: { error: String(e?.message ?? e), approved: true },
      });

      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
      };
    }
  } catch (e: any) {
    console.error('[ads-autopilot-approve] Error:', e);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
    };
  }
};
