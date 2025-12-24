/**
 * Centralized plan configuration for Stripe subscriptions
 * Maps plan IDs to Stripe price environment variables
 */

export type PlanId = 'operator' | 'growth' | 'label';

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  priceMonthly: number;
  stripePriceEnvKey: string;
  features: string[];
  creditsPerMonth: number;
  popular?: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  operator: {
    id: 'operator',
    name: 'Operator',
    description: 'For emerging artists',
    priceMonthly: 29,
    stripePriceEnvKey: 'STRIPE_PRICE_OPERATOR_MONTHLY',
    creditsPerMonth: 1000,
    features: [
      'Smart Links',
      'Pre-Save Campaigns',
      'Basic Analytics',
      'Email Capture',
      '1,000 credits/month',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    description: 'For serious independents',
    priceMonthly: 59,
    stripePriceEnvKey: 'STRIPE_PRICE_GROWTH_MONTHLY',
    creditsPerMonth: 3000,
    popular: true,
    features: [
      'Everything in Operator',
      'Ad Campaign Manager',
      'Advanced Analytics',
      'Ghoste AI Assistant',
      '3,000 credits/month',
      'Priority Support',
    ],
  },
  label: {
    id: 'label',
    name: 'Label',
    description: 'For teams & labels',
    priceMonthly: 99,
    stripePriceEnvKey: 'STRIPE_PRICE_LABEL_MONTHLY',
    creditsPerMonth: 10000,
    features: [
      'Everything in Growth',
      'Team Collaboration',
      'White Label Options',
      'Custom Integrations',
      '10,000 credits/month',
      'Dedicated Support',
    ],
  },
};

/**
 * Default plan for sticky CTA and primary marketing
 */
export const DEFAULT_STICKY_PLAN: PlanId = 'growth';

/**
 * Get plan by ID with fallback to growth plan
 */
export function getPlan(planId: PlanId): Plan {
  return PLANS[planId] || PLANS.growth;
}

/**
 * Get all plans as array, sorted by price
 */
export function getAllPlans(): Plan[] {
  return Object.values(PLANS).sort((a, b) => a.priceMonthly - b.priceMonthly);
}

/**
 * Map Stripe price ID to plan ID
 * Used in webhook processing
 */
export function getPlanIdFromPriceId(priceId: string): PlanId | null {
  for (const [planId, plan] of Object.entries(PLANS)) {
    // This will be used in webhook where we'll have actual price IDs from env
    if (process.env[plan.stripePriceEnvKey] === priceId) {
      return planId as PlanId;
    }
  }
  return null;
}
