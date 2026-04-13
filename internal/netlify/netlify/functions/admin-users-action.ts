import type { Handler } from '@netlify/functions';
import { json, requireAdmin, requireRole } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';
import { logAdminAction } from './_lib/audit';

type Action =
  | { type: 'grant_credits'; userId: string; amount: number; bucket?: 'manager' | 'tools' }
  | { type: 'revoke_credits'; userId: string; amount: number; bucket?: 'manager' | 'tools' }
  | { type: 'change_plan'; userId: string; plan: string }
  | { type: 'suspend'; userId: string; reason?: string }
  | { type: 'unsuspend'; userId: string };

/**
 * admin-users-action — executes destructive user actions.
 * Super-admin + admin only. All actions are audited.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const auth = await requireAdmin(event);
  if (!auth.ok) return json(auth.status, { error: auth.error });
  if (!requireRole(auth.admin, ['super_admin', 'admin'])) {
    return json(403, { error: 'insufficient_role' });
  }

  let body: Action;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!body.type || !body.userId) {
    return json(400, { error: 'invalid_action' });
  }

  const service = getServiceClient();

  // Resolve email for audit trail.
  const { data: targetProfile } = await service
    .from('user_profiles')
    .select('user_id, email, credits_manager, credits_tools, suspended_at')
    .eq('user_id', body.userId)
    .maybeSingle();

  const targetEmail = targetProfile?.email ?? null;

  try {
    switch (body.type) {
      case 'grant_credits':
      case 'revoke_credits': {
        const amount = Math.abs(Number(body.amount));
        if (!Number.isFinite(amount) || amount <= 0) {
          return json(400, { error: 'invalid_amount' });
        }
        const signed = body.type === 'grant_credits' ? amount : -amount;
        const bucket = body.bucket === 'tools' ? 'credits_tools' : 'credits_manager';
        const current = Number((targetProfile as any)?.[bucket] ?? 0);
        const next = Math.max(0, current + signed);
        const { error } = await service
          .from('user_profiles')
          .update({ [bucket]: next })
          .eq('user_id', body.userId);
        if (error) throw error;
        await logAdminAction(auth.admin, {
          action: body.type,
          targetUserId: body.userId,
          targetEmail,
          payload: { bucket, delta: signed, before: current, after: next },
        });
        return json(200, { ok: true, before: current, after: next });
      }
      case 'change_plan': {
        if (!body.plan || typeof body.plan !== 'string') {
          return json(400, { error: 'invalid_plan' });
        }
        const { error } = await service
          .from('user_profiles')
          .update({ plan: body.plan })
          .eq('user_id', body.userId);
        if (error) throw error;
        // Mirror on wallet if column exists; ignore errors.
        service
          .from('user_wallets')
          .update({ plan_key: body.plan })
          .eq('user_id', body.userId)
          .then(() => {}, () => {});
        await logAdminAction(auth.admin, {
          action: 'change_plan',
          targetUserId: body.userId,
          targetEmail,
          payload: { plan: body.plan },
        });
        return json(200, { ok: true, plan: body.plan });
      }
      case 'suspend': {
        const { error } = await service
          .from('user_profiles')
          .update({ suspended_at: new Date().toISOString() })
          .eq('user_id', body.userId);
        if (error) throw error;
        await logAdminAction(auth.admin, {
          action: 'suspend',
          targetUserId: body.userId,
          targetEmail,
          payload: { reason: body.reason ?? null },
        });
        return json(200, { ok: true });
      }
      case 'unsuspend': {
        const { error } = await service
          .from('user_profiles')
          .update({ suspended_at: null })
          .eq('user_id', body.userId);
        if (error) throw error;
        await logAdminAction(auth.admin, {
          action: 'unsuspend',
          targetUserId: body.userId,
          targetEmail,
          payload: {},
        });
        return json(200, { ok: true });
      }
      default:
        return json(400, { error: 'unknown_action' });
    }
  } catch (err: any) {
    return json(500, { error: 'action_failed', detail: err?.message ?? String(err) });
  }
};
