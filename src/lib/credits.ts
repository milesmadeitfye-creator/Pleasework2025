import { supabase } from '@/lib/supabase.client';

interface Wallet {
  user_id: string;
  plan: 'operator' | 'growth' | 'scale';
  monthly_credits: number;
  credits_remaining: number;
  credits_used: number;
  cycle_start: string;
  cycle_end: string;
  created_at: string;
  updated_at: string;
}

interface CreditCost {
  feature_key: string;
  credit_cost: number;
  description: string | null;
}

interface CreditError {
  code: 'INSUFFICIENT_CREDITS' | 'WALLET_NOT_FOUND' | 'COST_NOT_FOUND' | 'UNAUTHORIZED' | 'UNKNOWN';
  message: string;
  cost?: number;
  remaining?: number;
  feature_key?: string;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const CACHE_KEY = 'ghoste_credit_costs';
const CACHE_TIMESTAMP_KEY = 'ghoste_credit_costs_timestamp';

export class InsufficientCreditsError extends Error {
  code: 'INSUFFICIENT_CREDITS';
  cost: number;
  remaining: number;
  feature_key: string;

  constructor(cost: number, remaining: number, feature_key: string) {
    super(`Insufficient credits. Need ${cost}, have ${remaining}`);
    this.name = 'InsufficientCreditsError';
    this.code = 'INSUFFICIENT_CREDITS';
    this.cost = cost;
    this.remaining = remaining;
    this.feature_key = feature_key;
  }
}

export async function getWallet(userId?: string): Promise<Wallet | null> {
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
  }

  const { data, error } = await supabase
    .from('user_wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Credits] getWallet error:', error);
    return null;
  }

  // Auto-create wallet if missing
  if (!data) {
    const cycleEnd = new Date();
    cycleEnd.setMonth(cycleEnd.getMonth() + 1);

    const { data: newWallet, error: insertError } = await supabase
      .from('user_wallets')
      .insert({
        user_id: userId,
        plan: 'operator',
        monthly_credits: 30000,
        credits_remaining: 30000,
        credits_used: 0,
        cycle_start: new Date().toISOString(),
        cycle_end: cycleEnd.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Credits] Auto-create wallet error:', insertError);
      return null;
    }

    return newWallet;
  }

  return data;
}

export async function getCreditCosts(forceRefresh = false): Promise<CreditCost[]> {
  // Check cache first
  if (!forceRefresh) {
    const cached = localStorage.getItem(CACHE_KEY);
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);

    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp);
      if (age < CACHE_TTL) {
        try {
          return JSON.parse(cached);
        } catch (e) {
          console.error('[Credits] Cache parse error:', e);
        }
      }
    }
  }

  // Fetch from database
  const { data, error } = await supabase
    .from('credit_costs')
    .select('*')
    .order('feature_key');

  if (error) {
    console.error('[Credits] getCreditCosts error:', error);
    return [];
  }

  // Update cache
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data || []));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
  } catch (e) {
    console.error('[Credits] Cache write error:', e);
  }

  return data || [];
}

export async function getCost(featureKey: string): Promise<number> {
  const costs = await getCreditCosts();
  const cost = costs.find(c => c.feature_key === featureKey);

  if (!cost) {
    console.warn(`[Credits] No cost found for feature: ${featureKey}`);
    return 0;
  }

  return cost.credit_cost;
}

export async function chargeCredits(
  featureKey: string,
  metadata?: Record<string, any>
): Promise<{ ok: true; remaining: number; cost: number }> {
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized: No user session');
  }

  // Get wallet
  const wallet = await getWallet(user.id);
  if (!wallet) {
    const error: CreditError = {
      code: 'WALLET_NOT_FOUND',
      message: 'Wallet not found',
    };
    throw error;
  }

  // Get cost
  const cost = await getCost(featureKey);
  if (cost === 0) {
    console.warn(`[Credits] Feature ${featureKey} has 0 cost, allowing action`);
    return { ok: true, remaining: wallet.credits_remaining, cost: 0 };
  }

  // Scale plan bypass: Log usage but don't block
  if (wallet.plan === 'scale') {
    console.log(`[Credits] Scale plan bypass for ${featureKey}, cost: ${cost}`);

    // Insert transaction record
    await supabase.from('credit_transactions').insert({
      user_id: user.id,
      feature_key: featureKey,
      credits_used: cost,
      balance_before: wallet.credits_remaining,
      balance_after: wallet.credits_remaining,
      metadata: { ...metadata, bypass: true, plan: 'scale' },
    });

    // Update usage counter (don't reduce remaining)
    await supabase
      .from('user_wallets')
      .update({
        credits_used: wallet.credits_used + cost,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return { ok: true, remaining: wallet.credits_remaining, cost };
  }

  // Operator/Growth: Check and block if insufficient
  if (wallet.credits_remaining < cost) {
    throw new InsufficientCreditsError(cost, wallet.credits_remaining, featureKey);
  }

  // Call spend_credits RPC
  const { data, error } = await supabase.rpc('spend_credits', {
    p_user_id: user.id,
    p_feature_key: featureKey,
    p_metadata: metadata || {},
  });

  if (error) {
    console.error('[Credits] spend_credits RPC error:', error);

    // Check if it's insufficient credits error
    if (error.message?.includes('INSUFFICIENT_CREDITS')) {
      throw new InsufficientCreditsError(cost, wallet.credits_remaining, featureKey);
    }

    throw error;
  }

  // Development logging
  if (import.meta.env.DEV) {
    console.log(`[Credits] Charged ${cost} credits for ${featureKey}. Remaining: ${wallet.credits_remaining - cost}`);
  }

  return {
    ok: true,
    remaining: wallet.credits_remaining - cost,
    cost,
  };
}

export async function checkCanAfford(featureKey: string): Promise<boolean> {
  const wallet = await getWallet();
  if (!wallet) return false;

  // Scale plan can always afford
  if (wallet.plan === 'scale') return true;

  const cost = await getCost(featureKey);
  return wallet.credits_remaining >= cost;
}

export async function refreshWallet(): Promise<void> {
  // Force refresh by re-fetching
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await getWallet(user.id);
  }
}

export function clearCreditCache(): void {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_TIMESTAMP_KEY);
}
