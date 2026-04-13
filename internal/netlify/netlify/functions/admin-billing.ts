import type { HandlerEvent } from '@netlify/functions';
import { requireAdmin, json } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';

interface BillingResponse {
  totalUsers: number;
  proUsers: number;
  freeUsers: number;
  mrr: number;
  creditsOutstanding: number;
  creditsUsedTotal: number;
  stripeCheckouts: {
    completed: number;
    pending: number;
  };
  recentTransactions: Array<{
    transaction_id?: string;
    user_id: string;
    budget_type?: string;
    credit_change: number;
    action_type?: string;
    created_at?: string;
  }>;
  platformBreakdown: {
    web: number;
    ios: number;
    android: number;
    other: number;
  };
}

export async function handler(event: HandlerEvent) {
  try {
    const auth = await requireAdmin(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    const sb = getServiceClient();
    const response: BillingResponse = {
      totalUsers: 0,
      proUsers: 0,
      freeUsers: 0,
      mrr: 0,
      creditsOutstanding: 0,
      creditsUsedTotal: 0,
      stripeCheckouts: { completed: 0, pending: 0 },
      recentTransactions: [],
      platformBreakdown: { web: 0, ios: 0, android: 0, other: 0 },
    };

    // Count users by type
    try {
      const { data: profiles, error: profileErr } = await sb
        .from('user_profiles')
        .select('id, is_pro, credits_manager, credits_tools');

      if (!profileErr && profiles) {
        response.totalUsers = profiles.length;
        response.proUsers = profiles.filter((p: any) => p.is_pro).length;
        response.freeUsers = response.totalUsers - response.proUsers;

        // Sum credits outstanding
        response.creditsOutstanding = profiles.reduce(
          (sum: number, p: any) =>
            sum + (p.credits_manager || 0) + (p.credits_tools || 0),
          0
        );
      }
    } catch (err) {
      console.error('[admin-billing] user profiles query failed', err);
    }

    // Calculate MRR from billing plans
    try {
      const { data: billing, error: billingErr } = await sb
        .from('user_billing_v2')
        .select('plan_key');

      if (!billingErr && billing) {
        // Simple assumption: Standard=$29, Pro=$79, Enterprise=$199
        const planPrices: Record<string, number> = {
          starter: 0,
          standard: 29,
          pro: 79,
          enterprise: 199,
        };
        response.mrr = billing.reduce((sum: number, b: any) => {
          const price = planPrices[b.plan_key] || 0;
          return sum + price;
        }, 0);
      }
    } catch (err) {
      console.error('[admin-billing] user billing query failed', err);
    }

    // Stripe checkouts status
    try {
      const { data: checkouts, error: checkoutErr } = await sb
        .from('stripe_checkouts')
        .select('status');

      if (!checkoutErr && checkouts) {
        response.stripeCheckouts.completed = checkouts.filter(
          (c: any) => c.status === 'completed'
        ).length;
        response.stripeCheckouts.pending = checkouts.filter(
          (c: any) => c.status === 'pending'
        ).length;
      }
    } catch (err) {
      console.error('[admin-billing] stripe checkouts query failed', err);
    }

    // Total credits used
    try {
      const { data: creditTx, error: creditErr } = await sb
        .from('credit_transactions')
        .select('credits_used');

      if (!creditErr && creditTx) {
        response.creditsUsedTotal = creditTx.reduce(
          (sum: number, tx: any) => sum + (tx.credits_used || 0),
          0
        );
      }
    } catch (err) {
      console.error('[admin-billing] credit transactions query failed', err);
    }

    // Recent wallet transactions
    try {
      const { data: walletTx, error: walletErr } = await sb
        .from('wallet_transactions')
        .select('transaction_id, user_id, budget_type, credit_change, action_type, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!walletErr && walletTx) {
        response.recentTransactions = walletTx;
      }
    } catch (err) {
      console.error('[admin-billing] wallet transactions query failed', err);
    }

    // Platform breakdown from behavior_logs
    try {
      const { data: behaviorLogs, error: behaviorErr } = await sb
        .from('behavior_logs')
        .select('id, user_agent: metadata_json')
        .limit(1000); // Sample

      if (!behaviorErr && behaviorLogs) {
        behaviorLogs.forEach((log: any) => {
          const ua = typeof log.metadata_json === 'string' ? log.metadata_json : '';
          if (/iPhone|iPad|iOS/.test(ua)) response.platformBreakdown.ios++;
          else if (/Android/.test(ua)) response.platformBreakdown.android++;
          else if (ua) response.platformBreakdown.web++;
          else response.platformBreakdown.other++;
        });
      }
    } catch (err) {
      console.error('[admin-billing] behavior logs query failed', err);
    }

    return json(200, response);
  } catch (err) {
    console.error('[admin-billing] unhandled error', err);
    return json(500, { error: 'internal_server_error' });
  }
}
