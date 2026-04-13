import type { Handler } from '@netlify/functions';
import { json, requireAdmin } from './_lib/adminAuth';
import { logAdminAction } from './_lib/audit';

/**
 * admin-verify — the gate.
 *
 * Called by the internal SPA on boot and after every auth change.
 * Returns the admin's role + identity, or 401/403.
 *
 * SECURITY: validates Supabase JWT, then checks admin_users via
 * service-role (RLS is locked to service-role only). Never trust
 * email claims from the client.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const auth = await requireAdmin(event);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  // Record a lightweight login event (best-effort).
  logAdminAction(auth.admin, { action: 'verify', payload: {} }).catch(() => {});

  return json(200, {
    ok: true,
    email: auth.admin.email,
    role: auth.admin.role,
    userId: auth.admin.userId,
  });
};
