/**
 * Stripe billing plans configuration
 * Single source of truth for plan details and Price IDs
 *
 * CRITICAL: Do NOT use lookup keys. Use hardcoded Price IDs only.
 */

export type PlanKey = 'artist' | 'growth' | 'scale';

export interface BillingPlan {
  key: PlanKey;
  name: string;
  priceId: string;
  displayPrice: string;
  priceAmount: number;
  credits: string;
  tagline: string;
  bullets: string[];
  highlighted?: boolean;
}

/**
 * Production Stripe Price IDs (DO NOT CHANGE)
 * Artist:  price_1SieEYCmFCKCWOjb4AwhF9b4 ($9/mo)
 * Growth:  price_1SieFYCmFCKCWOjbI2wXKbR7 ($19/mo)
 * Scale:   price_1SieFzCmFCKCWOjbPDYABycm ($49/mo)
 */
export const BILLING_PLANS: BillingPlan[] = [
  {
    key: 'artist',
    name: 'Artist',
    priceId: 'price_1SieEYCmFCKCWOjb4AwhF9b4',
    displayPrice: '$9/mo',
    priceAmount: 9,
    credits: '10,000 credits / month',
    tagline: 'For emerging artists',
    bullets: [
      'Smart Links + Tracking',
      'Pre-Save Campaigns',
      'Basic Analytics',
      'Email Capture',
      'Fan Communication',
      '7-day free trial included',
    ],
  },
  {
    key: 'growth',
    name: 'Growth',
    priceId: 'price_1SieFYCmFCKCWOjbI2wXKbR7',
    displayPrice: '$19/mo',
    priceAmount: 19,
    credits: '30,000 credits / month',
    tagline: 'For serious independents',
    bullets: [
      'Everything in Artist',
      'Ad Campaign Manager',
      'Advanced Analytics',
      'Ghoste AI Assistant',
      'Video Tools',
      'Priority Support',
      '7-day free trial included',
    ],
    highlighted: true,
  },
  {
    key: 'scale',
    name: 'Scale',
    priceId: 'price_1SieFzCmFCKCWOjbPDYABycm',
    displayPrice: '$49/mo',
    priceAmount: 49,
    credits: '100,000 credits / month',
    tagline: 'For teams & labels',
    bullets: [
      'Everything in Growth',
      'Team Collaboration',
      'Unlimited Fair Use',
      'Custom Integrations',
      'Dedicated Support',
      'White Label Options',
      '7-day free trial included',
    ],
  },
];

/**
 * Allowed Stripe Price IDs (for validation)
 */
export const ALLOWED_PRICE_IDS = new Set(
  BILLING_PLANS.map(p => p.priceId)
);

/**
 * Get plan by key
 */
export function getPlanByKey(key: PlanKey): BillingPlan | undefined {
  return BILLING_PLANS.find(p => p.key === key);
}

/**
 * Get plan by Stripe Price ID
 */
export function getPlanByPriceId(priceId: string): BillingPlan | undefined {
  return BILLING_PLANS.find(p => p.priceId === priceId);
}

/**
 * Validate if a Price ID is allowed
 */
export function isValidPriceId(priceId: string): boolean {
  return ALLOWED_PRICE_IDS.has(priceId);
}
