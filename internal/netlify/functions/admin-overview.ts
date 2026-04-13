import type { Handler } from '@netlify/functions';
import { json, requireAdmin } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';

/**
 * admin-overview — real-time company snapshot for the Overview page.
 * Every query is wrapped in a safeCount so a missing/renamed table
 * degrades to `null` instead of crashing the whole panel.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });

  const auth = await requireAdmin(event);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  const service = getServiceClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    totalUsers,
    activeUsers24h,
    proUsers,
    runningCampaigns,
    smartLinks,
    oneClickLinks,
    clicks24h,
    errors24h,
    recentActions,
    creditAgg,
  ] = await Promise.all([
    safeCount(service, 'user_profiles'),
    countAuthActive24h(service, since24h),
    safeCount(service, 'user_profiles', (q) => q.eq('is_pro', true)),
    safeCount(service, 'ad_campaigns', (q) => q.in('status', ['active', 'running', 'live'])),
    safeCount(service, 'smart_links'),
    safeCount(service, 'oneclick_links'),
    safeCount(service, 'link_click_events', (q) => q.gte('created_at', since24h)),
    safeCount(service, 'ai_action_audit_logs', (q) =>
      q.eq('severity', 'error').gte('created_at', since24h),
    ),
    fetchRecentActions(service),
    fetchCredits(service),
  ]);

  const health = deriveHealth({ errors24h });

  return json(200, {
    ok: true,
    metrics: {
      totalUsers,
      activeUsers24h,
      proUsers,
      runningCampaigns,
      linksCreated: sumNullable(smartLinks, oneClickLinks),
      clicks24h,
      errors24h,
      creditsBalance: creditAgg.balance,
      creditsMonthlyLimit: creditAgg.monthlyLimit,
    },
    health,
    activity: recentActions,
    generatedAt: new Date().toISOString(),
  });
};

type CountQueryMod = (q: any) => any;

async function safeCount(
  service: ReturnType<typeof getServiceClient>,
  table: string,
  mod?: CountQueryMod,
): Promise<number | null> {
  try {
    let q: any = service.from(table).select('*', { count: 'exact', head: true });
    if (mod) q = mod(q);
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function countAuthActive24h(
  service: ReturnType<typeof getServiceClient>,
  since: string,
): Promise<number | null> {
  // admin.listUsers has no filter; use a lightweight query against user_profiles
  // if it tracks last_active_at, otherwise fall back to null.
  const candidates = ['last_active_at', 'last_seen_at', 'last_sign_in_at'];
  for (const col of candidates) {
    try {
      const { count, error } = await service
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .gte(col, since);
      if (!error) return count ?? 0;
    } catch {
      // try next
    }
  }
  return null;
}

async function fetchRecentActions(service: ReturnType<typeof getServiceClient>) {
  try {
    const { data, error } = await service
      .from('admin_action_logs')
      .select('id, actor_email, action, target_email, created_at, payload')
      .order('created_at', { ascending: false })
      .limit(15);
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

async function fetchCredits(service: ReturnType<typeof getServiceClient>) {
  try {
    const { data, error } = await service
      .from('user_wallets')
      .select('balance, monthly_credit_limit');
    if (error) return { balance: null, monthlyLimit: null };
    const balance = (data ?? []).reduce((s: number, r: any) => s + (Number(r.balance) || 0), 0);
    const monthlyLimit = (data ?? []).reduce(
      (s: number, r: any) => s + (Number(r.monthly_credit_limit) || 0),
      0,
    );
    return { balance, monthlyLimit };
  } catch {
    return { balance: null, monthlyLimit: null };
  }
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function deriveHealth(input: { errors24h: number | null }): 'green' | 'yellow' | 'red' {
  const e = input.errors24h ?? 0;
  if (e >= 50) return 'red';
  if (e >= 10) return 'yellow';
  return 'green';
}
