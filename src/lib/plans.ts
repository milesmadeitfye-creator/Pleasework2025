/**
 * Centralized plan configuration for Stripe subscriptions
 * Maps plan IDs to Stripe price environment variables
 *
 * Current pricing: Artist $9, Growth $19, Scale $49
 */

export type PlanId = 'artist' | 'growth' | 'scale';

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
  artist: {
    id: 'artist',
    name: 'Artist',
    description: 'For emerging artists',
    priceMonthly: 9,
    stripePriceEnvKey: 'STRIPE_PRICE_ARTIST',
    creditsPerMonth: 30000,
    features: [
      'Smart Links + Tracking',
      'Pre-Save Campaigns',
      'Basic Analytics',
      'Email Capture',
      'Fan Communication',
      '30,000 credits/month',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    description: 'For serious independents',
    priceMonthly: 19,
    stripePriceEnvKey: 'STRIPE_PRICE_GROWTH',
    creditsPerMonth: 65000,
    popular: true,
    features: [
      'Everything in Artist',
      'Ad Campaign Manager',
      'Advanced Analytics',
      'Ghoste AI Assistant',
      'Video Tools',
      '65,000 credits/month',
      'Priority Support',
    ],
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    description: 'For teams & labels',
    priceMonthly: 49,
    stripePriceEnvKey: 'STRIPE_PRICE_SCALE',
    creditsPerMonth: 500000,
    features: [
      'Everything in Growth',
      'Team Collaboration',
      'High Credit Allocation',
      'Custom Integrations',
      '500,000 credits/month',
      'Dedicated Support',
      'White Label Options',
    ],
  },
};

/**
 * Default plan for sticky CTA and primary marketing
 */
export const DEFAULT_STICKY_PLAN: PlanId = 'growth';

/**
 * Free tier configuration
 */
export const FREE_TIER = {
  name: 'Free',
  creditsPerMonth: 7500,
  description: 'Try Ghoste with limited credits',
};

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
