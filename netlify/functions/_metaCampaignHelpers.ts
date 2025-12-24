/**
 * Shared helpers for Meta campaign creation with CBO (Campaign Budget Optimization)
 * Ensures consistent payload structure across all Meta campaign endpoints
 */

export interface CreateCampaignInput {
  campaignName: string;
  adsetName: string;
  objective: string;
  dailyBudget: number; // in smallest currency unit (cents)
  optimizationGoal: string;
  startTime?: string;
  endTime?: string | null;
  targeting: any;
}

/**
 * Build campaign payload with CBO (budget on campaign level)
 */
export function buildCampaignPayload(input: CreateCampaignInput) {
  const { campaignName, objective, dailyBudget } = input;

  return {
    name: campaignName,
    objective,
    buying_type: 'AUCTION',
    status: 'PAUSED',
    special_ad_categories: [],
    // CBO – budget on campaign, not ad set
    daily_budget: String(dailyBudget),
    is_campaign_budget_optimization: true,
  };
}

/**
 * Build ad set payload for CBO campaign (no budget on ad set)
 */
export function buildAdsetPayload(
  input: CreateCampaignInput & { campaignId: string }
) {
  const {
    campaignId,
    adsetName,
    optimizationGoal,
    startTime,
    endTime,
    targeting,
  } = input;

  return {
    name: adsetName,
    campaign_id: campaignId,
    billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',

    // NO budget here – CBO only
    // ❌ daily_budget
    // ❌ lifetime_budget

    // Required when not using ad set budgets
    is_adset_budget_sharing_enabled: false,

    optimization_goal: optimizationGoal,
    start_time: startTime,
    end_time: endTime || undefined,
    targeting,
    status: 'PAUSED',
  };
}

/**
 * Normalize objective input to Meta API format
 */
export function normalizeObjective(input?: string): string {
  const key = (input || '').toUpperCase().trim();
  const map: Record<string, string> = {
    TRAFFIC: 'OUTCOME_TRAFFIC',
    CONVERSIONS: 'OUTCOME_SALES',
    AWARENESS: 'OUTCOME_AWARENESS',
    ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
  };
  return map[key] || 'OUTCOME_TRAFFIC';
}

/**
 * Normalize daily budget to cents (smallest currency unit)
 */
export function normalizeDailyBudget(input: number | string | undefined): number {
  if (input == null) return 500;
  const num = typeof input === 'string' ? Number(input) : input;
  if (!Number.isFinite(num) || num <= 0) {
    return 500;
  }
  // If less than 1000, assume dollars and convert to cents
  // Otherwise assume already in cents
  return num < 1000 ? Math.round(num * 100) : Math.round(num);
}
