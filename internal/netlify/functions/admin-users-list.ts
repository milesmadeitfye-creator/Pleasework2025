import type { Handler } from '@netlify/functions';
import { json, requireAdmin } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';

/**
 * admin-users-list — paginated user browser.
 * Query params:
 *   - page (1-based)
 *   - pageSize (default 25, max 100)
 *   - q (email prefix search)
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });

  const auth = await requireAdmin(event);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const service = getServiceClient();
  const page = Math.max(1, Number(event.queryStringParameters?.page ?? '1'));
  const pageSize = Math.min(100, Math.max(5, Number(event.queryStringParameters?.pageSize ?? '25')));
  const q = (event.queryStringParameters?.q || '').trim().toLowerCase();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = service
    .from('user_profiles')
    .select(
      'user_id, email, display_name, plan, is_pro, credits_manager, credits_tools, suspended_at, created_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (q) {
    query = query.ilike('email', `${q}%`);
  }

  const { data, count, error } = await query;
  if (error) {
    // Surface the error — but don't leak SQL
    return json(500, { error: 'query_failed', detail: error.message });
  }

  // Join wallet balances in a second query (smaller set)
  const ids = (data ?? []).map((u: any) => u.user_id).filter(Boolean);
  const wallets = ids.length
    ? await service
        .from('user_wallets')
        .select('user_id, balance, subscription_status, plan_key, monthly_credit_limit')
        .in('user_id', ids)
    : { data: [] as any[] };

  const walletMap = new Map(
    (wallets.data ?? []).map((w: any) => [w.user_id, w]),
  );

  const users = (data ?? []).map((u: any) => ({
    userId: u.user_id,
    email: u.email,
    displayName: u.display_name,
    plan: u.plan ?? (walletMap.get(u.user_id) as any)?.plan_key ?? null,
    isPro: !!u.is_pro,
    credits:
      (Number(u.credits_manager) || 0) +
      (Number(u.credits_tools) || 0) +
      (Number((walletMap.get(u.user_id) as any)?.balance) || 0),
    subscriptionStatus: (walletMap.get(u.user_id) as any)?.subscription_status ?? null,
    suspended: !!u.suspended_at,
    createdAt: u.created_at,
  }));

  return json(200, {
    ok: true,
    page,
    pageSize,
    total: count ?? 0,
    users,
  });
};
