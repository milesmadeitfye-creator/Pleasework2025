import type { HandlerEvent } from '@netlify/functions';
import { getAnonClient, getServiceClient } from './supabaseAdmin';

export type AdminRole = 'super_admin' | 'admin' | 'support';

export interface AdminContext {
  userId: string;
  email: string;
  role: AdminRole;
  ip: string | null;
  userAgent: string | null;
}

export interface AdminAuthFailure {
  ok: false;
  status: number;
  error: string;
}

export type AdminAuthResult = { ok: true; admin: AdminContext } | AdminAuthFailure;

/**
 * Verifies the incoming bearer token belongs to a Supabase user,
 * AND that user's email is in admin_users with is_active=true.
 *
 * This must be called by EVERY internal Netlify function before
 * touching any data. Never trust the client.
 */
export async function requireAdmin(event: HandlerEvent): Promise<AdminAuthResult> {
  const authHeader =
    event.headers?.authorization || event.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader || '');
  if (!match) return { ok: false, status: 401, error: 'missing_token' };

  const token = match[1];
  const anon = getAnonClient();
  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: 'invalid_token' };
  }
  const email = userData.user.email?.toLowerCase() || '';
  if (!email) return { ok: false, status: 401, error: 'no_email' };

  const service = getServiceClient();
  const { data: admin, error: adminErr } = await service
    .from('admin_users')
    .select('email, role, is_active')
    .ilike('email', email)
    .maybeSingle();

  if (adminErr) {
    return { ok: false, status: 500, error: 'admin_lookup_failed' };
  }
  if (!admin || !admin.is_active) {
    return { ok: false, status: 403, error: 'not_admin' };
  }

  // Update last_login_at (best-effort)
  service
    .from('admin_users')
    .update({ last_login_at: new Date().toISOString() })
    .ilike('email', email)
    .then(() => {}, () => {});

  const ip =
    (event.headers?.['x-nf-client-connection-ip'] as string) ||
    (event.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    null;
  const userAgent = (event.headers?.['user-agent'] as string) || null;

  return {
    ok: true,
    admin: {
      userId: userData.user.id,
      email,
      role: admin.role as AdminRole,
      ip,
      userAgent,
    },
  };
}

export function requireRole(admin: AdminContext, allowed: AdminRole[]): boolean {
  return allowed.includes(admin.role);
}

export function json(status: number, body: unknown) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
    body: JSON.stringify(body),
  };
}
