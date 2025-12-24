/**
 * Budget Estimator for Ghoste One
 *
 * Calculates recommended monthly ad/content budget based on user goals
 * Uses a baseline model with multipliers for different factors
 */

export type PrimaryGoal =
  | 'growth'
  | 'streams'
  | 'followers'
  | 'playlists'
  | 'release'
  | 'touring'
  | 'merch';

export type RiskLevel = 'conservative' | 'balanced' | 'aggressive';
export type Timeframe = '30d' | '60d' | '90d';

export interface BudgetEstimatorInputs {
  primaryGoal: PrimaryGoal;
  secondaryGoals?: PrimaryGoal[];
  timeframe: Timeframe;
  riskLevel: RiskLevel;
  hoursPerWeek: number;
  genre?: string;
  region?: string;
  budgetCap?: number;
}

export interface BudgetAllocation {
  ads: number;           // Percentage for paid ads
  content: number;       // Percentage for content production
  influencer: number;    // Percentage for influencer/UGC seeding
  outreach: number;      // Percentage for playlist/outreach
}

export interface BudgetTiers {
  low: number;
  recommended: number;
  high: number;
}

export interface BudgetEstimate {
  recommendedMonthlyBudget: number;
  recommendedDailyBudget: number;
  allocation: BudgetAllocation;
  tiers: BudgetTiers;
  notes: string[];
  confidence: 'low' | 'medium' | 'high';
}

// Baseline budgets per goal (monthly in USD)
const GOAL_BASELINES: Record<PrimaryGoal, number> = {
  growth: 300,
  streams: 300,
  followers: 200,
  playlists: 150,
  release: 400,
  touring: 250,
  merch: 200,
};

// Risk multipliers
const RISK_MULTIPLIERS: Record<RiskLevel, number> = {
  conservative: 0.75,
  balanced: 1.0,
  aggressive: 1.5,
};

// Timeframe multipliers (longer campaigns = efficiency gains)
const TIMEFRAME_MULTIPLIERS: Record<Timeframe, number> = {
  '30d': 1.0,
  '60d': 0.85,
  '90d': 0.75,
};

// Default allocations per goal type
const GOAL_ALLOCATIONS: Record<PrimaryGoal, BudgetAllocation> = {
  growth: { ads: 50, content: 25, influencer: 15, outreach: 10 },
  streams: { ads: 55, content: 20, influencer: 15, outreach: 10 },
  followers: { ads: 60, content: 25, influencer: 10, outreach: 5 },
  playlists: { ads: 30, content: 20, influencer: 15, outreach: 35 },
  release: { ads: 50, content: 30, influencer: 15, outreach: 5 },
  touring: { ads: 55, content: 20, influencer: 15, outreach: 10 },
  merch: { ads: 60, content: 25, influencer: 10, outreach: 5 },
};

/**
 * Calculate recommended budget based on user inputs
 */
export function calculateBudget(inputs: BudgetEstimatorInputs): BudgetEstimate {
  const {
    primaryGoal,
    secondaryGoals = [],
    timeframe,
    riskLevel,
    hoursPerWeek,
    budgetCap,
  } = inputs;

  // Start with baseline for primary goal
  let baseMonthly = GOAL_BASELINES[primaryGoal];

  // Add 20% for each secondary goal (capped at 2 secondary goals)
  const secondaryCount = Math.min(secondaryGoals.length, 2);
  baseMonthly += baseMonthly * (secondaryCount * 0.2);

  // Apply risk multiplier
  baseMonthly *= RISK_MULTIPLIERS[riskLevel];

  // Apply timeframe multiplier
  baseMonthly *= TIMEFRAME_MULTIPLIERS[timeframe];

  // Adjust for content effort
  if (hoursPerWeek < 3) {
    baseMonthly *= 1.2; // Need more ad spend to compensate
  } else if (hoursPerWeek > 10) {
    baseMonthly *= 0.9; // Organic support reduces ad needs
  }

  // Apply budget cap if set
  if (budgetCap && budgetCap < baseMonthly) {
    baseMonthly = budgetCap;
  }

  // Round to nearest $10
  const recommendedMonthly = Math.round(baseMonthly / 10) * 10;
  const recommendedDaily = Math.round((recommendedMonthly / 30) * 100) / 100;

  // Calculate tiers
  const tiers: BudgetTiers = {
    low: Math.round(recommendedMonthly * 0.6 / 10) * 10,
    recommended: recommendedMonthly,
    high: Math.round(recommendedMonthly * 1.5 / 10) * 10,
  };

  // Get allocation for primary goal
  const allocation = { ...GOAL_ALLOCATIONS[primaryGoal] };

  // Generate notes
  const notes = generateNotes(inputs, recommendedMonthly);

  // Determine confidence
  const confidence = determineConfidence(inputs);

  return {
    recommendedMonthlyBudget: recommendedMonthly,
    recommendedDailyBudget: recommendedDaily,
    allocation,
    tiers,
    notes,
    confidence,
  };
}

/**
 * Generate contextual notes for the budget estimate
 */
function generateNotes(inputs: BudgetEstimatorInputs, budget: number): string[] {
  const notes: string[] = [];

  // Risk level notes
  if (inputs.riskLevel === 'conservative') {
    notes.push('Conservative approach focuses on proven channels with lower spend');
  } else if (inputs.riskLevel === 'aggressive') {
    notes.push('Aggressive approach tests multiple channels for faster growth');
  }

  // Timeframe notes
  if (inputs.timeframe === '90d') {
    notes.push('Longer campaigns allow for optimization and better cost efficiency');
  } else if (inputs.timeframe === '30d') {
    notes.push('Short campaigns require higher daily spend for impact');
  }

  // Hours per week notes
  if (inputs.hoursPerWeek < 3) {
    notes.push('Low content output means more reliance on paid ads');
  } else if (inputs.hoursPerWeek > 10) {
    notes.push('High content output can reduce paid ad dependency');
  }

  // Goal-specific notes
  if (inputs.primaryGoal === 'playlists') {
    notes.push('Playlist campaigns emphasize outreach and relationship building');
  } else if (inputs.primaryGoal === 'release') {
    notes.push('Release campaigns front-load spend in first 2 weeks');
  } else if (inputs.primaryGoal === 'followers') {
    notes.push('Follower growth requires consistent engagement and retargeting');
  }

  // Budget cap note
  if (inputs.budgetCap && inputs.budgetCap < budget) {
    notes.push('Budget capped at your specified limit');
  }

  // Secondary goals note
  if (inputs.secondaryGoals && inputs.secondaryGoals.length > 0) {
    notes.push(`Supporting ${inputs.secondaryGoals.length} additional goal${inputs.secondaryGoals.length > 1 ? 's' : ''}`);
  }

  return notes;
}

/**
 * Determine confidence level based on input completeness
 */
function determineConfidence(inputs: BudgetEstimatorInputs): 'low' | 'medium' | 'high' {
  let score = 0;

  // Core inputs always present
  score += 3;

  // Genre adds context
  if (inputs.genre) score += 1;

  // Region adds context
  if (inputs.region) score += 1;

  // Secondary goals show clarity
  if (inputs.secondaryGoals && inputs.secondaryGoals.length > 0) score += 1;

  // Realistic hours per week
  if (inputs.hoursPerWeek >= 3 && inputs.hoursPerWeek <= 20) score += 1;

  if (score <= 4) return 'low';
  if (score <= 6) return 'medium';
  return 'high';
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format daily currency with cents
 */
export function formatDailyCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Get goal display name
 */
export function getGoalDisplayName(goal: PrimaryGoal): string {
  const names: Record<PrimaryGoal, string> = {
    growth: 'Overall Growth',
    streams: 'Stream Count',
    followers: 'Follower Growth',
    playlists: 'Playlist Placements',
    release: 'Release Campaign',
    touring: 'Tour Promotion',
    merch: 'Merchandise Sales',
  };
  return names[goal];
}

/**
 * Get goal description
 */
export function getGoalDescription(goal: PrimaryGoal): string {
  const descriptions: Record<PrimaryGoal, string> = {
    growth: 'Balanced growth across all metrics',
    streams: 'Maximize plays on streaming platforms',
    followers: 'Build engaged social media following',
    playlists: 'Secure editorial and curator placements',
    release: 'Launch new music with maximum impact',
    touring: 'Promote tour dates and sell tickets',
    merch: 'Drive merchandise and product sales',
  };
  return descriptions[goal];
}
