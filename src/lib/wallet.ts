import { supabase } from '@/lib/supabase.client';
import { isDevWalletOverride } from './devWalletOverride';

export type BudgetType = 'MANAGER' | 'TOOLS';

export type ActionType = 'TOP_UP' | 'CONSUMPTION' | 'TRANSFER' | 'REFUND';

/**
 * Feature cost constants (in credits)
 */
export const FEATURE_COSTS = {
  // MANAGER BUDGET (High-cost strategic actions)
  VIRAL_LEAD_SETUP: 2000,
  META_AD_CAMPAIGN: 3000,
  EMAIL_CAMPAIGN_BASE: 100, // + 1 credit per 10 recipients
  AI_RECOMMENDATIONS: 1500,
  DYNAMIC_AD_ENGINE: 2000,
  SPLIT_NEGOTIATION: 500,

  // TOOLS BUDGET (Utility/rendering actions)
  GHOSTE_STUDIO_VIDEO_RENDER: 1500,
  GHOSTE_STUDIO_IMAGE_RENDER: 500,
  GHOSTE_STUDIO_AUDIO_RENDER: 800,
  COVER_ART_GENERATE: 800,
  SMART_LINK_CREATE: 100,
  EMAIL_CAPTURE_LINK: 50,
  PRESAVE_LINK: 100,
  VIDEO_CAPTION: 300,
  AI_LYRIC_GENERATION: 400,
} as const;

export interface UserWallet {
  user_id: string;
  manager_budget_balance: number;
  tools_budget_balance: number;
  last_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WalletWithTotals extends UserWallet {
  total_credits: number;
}

export interface WalletTransaction {
  transaction_id: string;
  user_id: string;
  timestamp: string;
  budget_type: BudgetType;
  credit_change: number;
  action_type: ActionType;
  reference_feature: string;
  external_reference: string | null;
  correlated_group_id: string | null;
  created_at: string;
}

/**
 * Adds credits to a user's budget (MANAGER or TOOLS)
 * @param userId - User ID
 * @param amount - Amount of credits to add (must be positive)
 * @param budgetType - Target budget ('MANAGER' or 'TOOLS')
 * @param referenceFeature - Feature that triggered the top-up (e.g., 'MonthlySubscription')
 * @param externalReference - External reference (e.g., Stripe charge ID)
 * @returns Updated wallet
 */
export async function topUpBudget(
  userId: string,
  amount: number,
  budgetType: BudgetType,
  referenceFeature = 'TopUp',
  externalReference?: string
): Promise<UserWallet> {
  console.log('[wallet] Top-up:', { userId, amount, budgetType, referenceFeature });

  const { data, error } = await supabase.rpc('wallet_top_up', {
    p_user_id: userId,
    p_amount: amount,
    p_budget_type: budgetType,
    p_reference_feature: referenceFeature,
    p_external_reference: externalReference ?? null,
  });

  if (error) {
    console.error('[wallet] Top-up error:', error);
    throw new Error(`Failed to top up ${budgetType} budget: ${error.message}`);
  }

  console.log('[wallet] Top-up successful:', data);
  return data;
}

/**
 * Deducts credits from a user's budget (with overdraft protection)
 * @param userId - User ID
 * @param amount - Amount of credits to deduct (must be positive)
 * @param budgetType - Source budget ('MANAGER' or 'TOOLS')
 * @param featureName - Feature consuming credits (e.g., 'ViralLeadSetup')
 * @param externalReference - Optional external reference
 * @returns Updated wallet
 * @throws Error if insufficient funds
 */
export async function consumeCredits(
  userId: string,
  amount: number,
  budgetType: BudgetType,
  featureName: string,
  externalReference?: string
): Promise<UserWallet> {
  console.log('[wallet] Consume:', { userId, amount, budgetType, featureName });

  // Check if user is in dev override list
  const { data: { user } } = await supabase.auth.getUser();
  if (isDevWalletOverride(user)) {
    console.log('[wallet] DEV OVERRIDE: Skipping credit consumption for', user?.email);
    // Return actual wallet state, not mock - this allows UI to show real balances
    const wallet = await getWallet(userId);
    return wallet || {
      user_id: userId,
      manager_budget_balance: 0,
      tools_budget_balance: 0,
      last_transaction_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase.rpc('wallet_consume', {
    p_user_id: userId,
    p_amount: amount,
    p_budget_type: budgetType,
    p_feature_name: featureName,
    p_external_reference: externalReference ?? null,
  });

  if (error) {
    console.error('[wallet] Consume error:', error);

    // Check if it's an insufficient funds error
    if (error.message.includes('INSUFFICIENT_FUNDS')) {
      throw new Error(`Insufficient ${budgetType} credits. Please top up your wallet.`);
    }

    throw new Error(`Failed to consume ${budgetType} credits: ${error.message}`);
  }

  console.log('[wallet] Consume successful:', data);
  return data;
}

/**
 * Transfers credits between a user's two budgets (MANAGER ↔ TOOLS)
 * @param userId - User ID
 * @param amount - Amount of credits to transfer (must be positive)
 * @param sourceBudget - Source budget ('MANAGER' or 'TOOLS')
 * @param targetBudget - Target budget ('MANAGER' or 'TOOLS', must differ from source)
 * @param referenceFeature - Reason for transfer (e.g., 'UserAdjust')
 * @returns Updated wallet
 * @throws Error if insufficient funds or invalid budgets
 */
export async function transferCredits(
  userId: string,
  amount: number,
  sourceBudget: BudgetType,
  targetBudget: BudgetType,
  referenceFeature = 'BudgetTransfer'
): Promise<UserWallet> {
  console.log('[wallet] Transfer:', { userId, amount, sourceBudget, targetBudget });

  if (sourceBudget === targetBudget) {
    throw new Error('Source and target budgets must be different');
  }

  const { data, error } = await supabase.rpc('wallet_transfer', {
    p_user_id: userId,
    p_amount: amount,
    p_source_budget: sourceBudget,
    p_target_budget: targetBudget,
    p_reference_feature: referenceFeature,
  });

  if (error) {
    console.error('[wallet] Transfer error:', error);

    if (error.message.includes('INSUFFICIENT_FUNDS')) {
      throw new Error(`Insufficient ${sourceBudget} credits for transfer.`);
    }

    throw new Error(`Failed to transfer credits: ${error.message}`);
  }

  console.log('[wallet] Transfer successful:', data);
  return data;
}

/**
 * Gets a user's current wallet balances with computed totals
 * @param userId - User ID (optional, uses current user if not provided)
 * @returns Wallet with totals or null if doesn't exist
 */
export async function getWallet(userId?: string): Promise<WalletWithTotals | null> {
  let query = supabase.from('user_wallets').select('*');

  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    // Get current user's wallet
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[wallet] Auth error:', authError);
      return null;
    }

    query = query.eq('user_id', user.id);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('[wallet] Get wallet error:', error);
    throw new Error(`Failed to get wallet: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const wallet = data as UserWallet;
  return {
    ...wallet,
    total_credits: (wallet.manager_budget_balance ?? 0) + (wallet.tools_budget_balance ?? 0),
  };
}

/**
 * Gets a user's transaction history
 * @param userId - User ID
 * @param limit - Maximum number of transactions to return
 * @param budgetType - Optional filter by budget type
 * @returns Array of transactions
 */
export async function getTransactionHistory(
  userId: string,
  limit = 50,
  budgetType?: BudgetType
): Promise<WalletTransaction[]> {
  let query = supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (budgetType) {
    query = query.eq('budget_type', budgetType);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[wallet] Get transactions error:', error);
    throw new Error(`Failed to get transaction history: ${error.message}`);
  }

  return data || [];
}

/**
 * Gets the current user's wallet (convenience method)
 * @returns Current user's wallet or null
 */
export async function getCurrentUserWallet(): Promise<UserWallet | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('User not authenticated');
  }

  return getWallet(user.id);
}

/**
 * Checks if user has sufficient credits for an operation
 * @param userId - User ID
 * @param amount - Required amount
 * @param budgetType - Budget to check
 * @returns true if sufficient credits, false otherwise
 */
export async function hasSufficientCredits(
  userId: string,
  amount: number,
  budgetType: BudgetType
): Promise<boolean> {
  // Check if user is in dev override list
  const { data: { user } } = await supabase.auth.getUser();
  if (isDevWalletOverride(user)) {
    console.log('[wallet] DEV OVERRIDE: Credit check bypassed for', user?.email);
    return true;
  }

  const wallet = await getWallet(userId);

  if (!wallet) {
    return false;
  }

  const balance =
    budgetType === 'MANAGER'
      ? wallet.manager_budget_balance
      : wallet.tools_budget_balance;

  return balance >= amount;
}

/**
 * Formats credits amount for display
 * @param amount - Credit amount
 * @returns Formatted string (e.g., "1,234 credits")
 */
export function formatCredits(amount: number): string {
  return `${amount.toLocaleString()} credit${amount !== 1 ? 's' : ''}`;
}

/**
 * Gets a human-readable description for a budget type
 * @param budgetType - Budget type
 * @returns Description string
 */
export function getBudgetDescription(budgetType: BudgetType): string {
  return budgetType === 'MANAGER'
    ? 'Manager Budget (High-cost strategic actions)'
    : 'Tools Budget (Utility & rendering actions)';
}

/**
 * Gets a color class for a budget type
 * @param budgetType - Budget type
 * @returns Tailwind color class
 */
export function getBudgetColor(budgetType: BudgetType): string {
  return budgetType === 'MANAGER' ? 'text-purple-400' : 'text-blue-400';
}

/**
 * Gets an icon for an action type
 * @param actionType - Action type
 * @returns Icon description
 */
export function getActionIcon(actionType: ActionType): string {
  switch (actionType) {
    case 'TOP_UP':
      return '⬆️';
    case 'CONSUMPTION':
      return '⬇️';
    case 'TRANSFER':
      return '↔️';
    case 'REFUND':
      return '↩️';
    default:
      return '•';
  }
}
