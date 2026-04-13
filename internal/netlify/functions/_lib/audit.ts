import { getServiceClient } from './supabaseAdmin';
import type { AdminContext } from './adminAuth';

export interface AuditEntry {
  action: string;
  targetUserId?: string | null;
  targetEmail?: string | null;
  payload?: Record<string, unknown>;
}

export async function logAdminAction(admin: AdminContext, entry: AuditEntry): Promise<void> {
  try {
    const service = getServiceClient();
    await service.from('admin_action_logs').insert({
      actor_email: admin.email,
      actor_role: admin.role,
      action: entry.action,
      target_user_id: entry.targetUserId ?? null,
      target_email: entry.targetEmail ?? null,
      payload: entry.payload ?? {},
      ip_address: admin.ip,
      user_agent: admin.userAgent,
    });
  } catch (err) {
    // Don't break the caller — audit failure is logged to Netlify's own logs.
    console.error('[audit] failed to log admin action', err);
  }
}
