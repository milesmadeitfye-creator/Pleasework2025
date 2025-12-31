/**
 * Meta Payload Builders - Single Source of Truth
 *
 * Creates deterministic, sanitized payloads for Meta Ads API
 * Mode: ABO (Ad Set Budget Optimization) - budget at ad set level
 */

/**
 * Valid Meta custom_event_type values per Meta Ads API documentation
 */
const VALID_CUSTOM_EVENT_TYPES = [
  'RATE', 'TUTORIAL_COMPLETION', 'CONTACT', 'CUSTOMIZE_PRODUCT', 'DONATE',
  'FIND_LOCATION', 'SCHEDULE', 'START_TRIAL', 'SUBMIT_APPLICATION', 'SUBSCRIBE',
  'ADD_TO_CART', 'ADD_TO_WISHLIST', 'INITIATED_CHECKOUT', 'ADD_PAYMENT_INFO',
  'PURCHASE', 'LEAD', 'COMPLETE_REGISTRATION', 'CONTENT_VIEW', 'SEARCH',
  'SERVICE_BOOKING_REQUEST', 'MESSAGING_CONVERSATION_STARTED_7D',
  'LEVEL_ACHIEVED', 'ACHIEVEMENT_UNLOCKED', 'SPENT_CREDITS'
];

interface CampaignPayloadInput {
  name: string;
  ad_goal: string;
}

interface AdSetPayloadInput {
  name: string;
  campaign_id: string;
  ad_goal: string;
  daily_budget_cents: number;
  destination_url?: string;
  pixel_id?: string;
  page_id?: string;
}

interface PayloadDebugInfo {
  has_bid_amount: boolean;
  has_cost_cap: boolean;
  has_target_cost: boolean;
  has_bid_constraints: boolean;
  has_promoted_object: boolean;
  has_custom_event_type: boolean;
  bid_strategy: string;
  optimization_goal: string;
  billing_event: string;
}

/**
 * Map ad_goal to Meta objective
 */
function mapGoalToObjective(ad_goal: string): string {
  const goal = ad_goal.toLowerCase();

  if (goal === 'link_clicks' || goal === 'traffic' || goal === 'streams') {
    return 'OUTCOME_TRAFFIC';
  }

  if (goal === 'conversions' || goal === 'sales') {
    return 'OUTCOME_SALES';
  }

  if (goal === 'leads' || goal === 'lead_generation') {
    return 'OUTCOME_LEADS';
  }

  if (goal === 'awareness' || goal === 'reach') {
    return 'OUTCOME_AWARENESS';
  }

  if (goal === 'engagement') {
    return 'OUTCOME_ENGAGEMENT';
  }

  // Default to traffic for unknown goals
  console.warn('[mapGoalToObjective] Unknown ad_goal, defaulting to OUTCOME_TRAFFIC:', ad_goal);
  return 'OUTCOME_TRAFFIC';
}

/**
 * Build Meta Campaign Payload (ABO mode)
 *
 * ABO rules:
 * - NO daily_budget or lifetime_budget at campaign level
 * - is_adset_budget_sharing_enabled MUST be false
 * - Budget is set at ad set level
 */
export function buildMetaCampaignPayload(input: CampaignPayloadInput): any {
  const { name, ad_goal } = input;
  const objective = mapGoalToObjective(ad_goal);

  const payload: any = {
    name,
    objective,
    status: 'PAUSED',
    buying_type: 'AUCTION',
    special_ad_categories: [],
    // ABO mode: budget at ad set level, NOT campaign level
    is_adset_budget_sharing_enabled: false,
  };

  // ABO ASSERTION: Campaign must NOT have budget fields
  if (payload.daily_budget || payload.lifetime_budget || payload.budget_remaining) {
    throw new Error('ABO_ASSERT: Campaign must not have budget fields - budget is at ad set level');
  }

  console.log('[buildMetaCampaignPayload] ABO Campaign payload:', {
    objective,
    is_adset_budget_sharing_enabled: payload.is_adset_budget_sharing_enabled,
    has_budget: false,
    mode: 'ABO',
  });

  return payload;
}

/**
 * Build Meta Ad Set Payload (ABO mode)
 *
 * ABO rules:
 * - daily_budget MUST be set (in cents, as string)
 * - billing_event: "IMPRESSIONS" (Meta standard for LINK_CLICKS)
 * - optimization_goal: "LINK_CLICKS" (for traffic goals)
 * - bid_strategy: "LOWEST_COST_WITHOUT_CAP" (no bid_amount required)
 * - destination_type: "WEBSITE" (for traffic goals)
 * - NO promoted_object for traffic/link_clicks goals
 * - NO custom_event_type for traffic goals
 */
export function buildMetaAdSetPayload(input: AdSetPayloadInput): any {
  const { name, campaign_id, ad_goal, daily_budget_cents, destination_url, pixel_id, page_id } = input;
  const goal = ad_goal.toLowerCase();

  // Check if this is a traffic/link clicks goal
  const isTrafficGoal = goal === 'link_clicks' || goal === 'traffic' || goal === 'streams';

  // Streams temporarily routes to traffic until conversion flow is implemented
  if (goal === 'streams') {
    console.log('[buildMetaAdSetPayload] Routing "streams" goal to traffic payload');
  }

  const payload: any = {
    name,
    status: 'PAUSED',
    campaign_id,
    // ABO mode: budget at ad set level (required)
    daily_budget: String(daily_budget_cents),
    // Bidding settings (no bid_amount - automatic optimization)
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'LINK_CLICKS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    // Targeting
    targeting: {
      geo_locations: { countries: ['US'] },
      age_min: 18,
      age_max: 65,
    },
  };

  // Add destination_type for traffic goals
  if (isTrafficGoal) {
    payload.destination_type = 'WEBSITE';
  }

  // CRITICAL: Do NOT add promoted_object for traffic goals
  // Only add for conversion goals if we have proper pixel setup
  if (!isTrafficGoal) {
    // Conversion goals - add promoted_object with pixel
    if (pixel_id) {
      payload.promoted_object = {
        pixel_id,
        // ONLY add custom_event_type if NOT a traffic goal
        custom_event_type: 'PURCHASE',
      };
      console.log('[buildMetaAdSetPayload] Added promoted_object for conversion goal');
    } else if (page_id && (goal === 'leads' || goal === 'lead_generation')) {
      // Lead generation - use page_id, NO custom_event_type
      payload.promoted_object = {
        page_id,
      };
      console.log('[buildMetaAdSetPayload] Added promoted_object for lead goal');
    }
  }

  // ABO ASSERTION: Ad Set must have budget
  if (!payload.daily_budget && !payload.lifetime_budget) {
    throw new Error('ABO_ASSERT: Ad set must have daily_budget or lifetime_budget');
  }

  // Sanitize payload - remove invalid bid fields
  delete payload.bid_amount;
  delete payload.cost_cap;
  delete payload.target_cost;
  delete payload.bid_constraints;

  console.log('[buildMetaAdSetPayload] ABO Ad Set payload:', {
    ad_goal,
    daily_budget: payload.daily_budget,
    billing_event: payload.billing_event,
    optimization_goal: payload.optimization_goal,
    bid_strategy: payload.bid_strategy,
    destination_type: payload.destination_type || 'none',
    has_promoted_object: !!payload.promoted_object,
    mode: 'ABO',
  });

  return payload;
}

/**
 * Generate debug info about payload for error reporting
 */
export function getPayloadDebugInfo(payload: any): PayloadDebugInfo {
  return {
    has_bid_amount: 'bid_amount' in payload,
    has_cost_cap: 'cost_cap' in payload,
    has_target_cost: 'target_cost' in payload,
    has_bid_constraints: 'bid_constraints' in payload,
    has_promoted_object: !!payload.promoted_object,
    has_custom_event_type: !!(payload.promoted_object?.custom_event_type),
    bid_strategy: payload.bid_strategy || 'NOT_SET',
    optimization_goal: payload.optimization_goal || 'NOT_SET',
    billing_event: payload.billing_event || 'NOT_SET',
  };
}

/**
 * Sanitize ad set payload - final validation before sending to Meta
 * Removes any invalid fields that could cause errors
 */
export function sanitizeAdSetPayload(payload: any, ad_goal: string): any {
  const sanitized = { ...payload };
  const goal = ad_goal.toLowerCase();
  const isTrafficGoal = goal === 'link_clicks' || goal === 'traffic' || goal === 'streams';

  // CRITICAL: Remove promoted_object for traffic goals
  if (isTrafficGoal) {
    if (sanitized.promoted_object) {
      console.log('[sanitizeAdSetPayload] Removing promoted_object for traffic goal');
      delete sanitized.promoted_object;
    }

    // Ensure correct settings for traffic
    sanitized.optimization_goal = 'LINK_CLICKS';
    sanitized.billing_event = 'IMPRESSIONS';
    sanitized.destination_type = 'WEBSITE';
  }

  // CRITICAL: Remove bid fields that require bid_amount
  delete sanitized.bid_amount;
  delete sanitized.cost_cap;
  delete sanitized.target_cost;
  delete sanitized.bid_constraints;

  // Ensure bid_strategy is set
  if (!sanitized.bid_strategy) {
    sanitized.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
  }

  // Validate promoted_object if present
  if (sanitized.promoted_object) {
    // Remove legacy fields
    delete sanitized.promoted_object.event_type;
    delete sanitized.promoted_object.custom_conversion_id;

    // Validate custom_event_type
    if (sanitized.promoted_object.custom_event_type) {
      if (!VALID_CUSTOM_EVENT_TYPES.includes(sanitized.promoted_object.custom_event_type)) {
        console.warn(
          `[sanitizeAdSetPayload] Invalid custom_event_type: ${sanitized.promoted_object.custom_event_type}, removing`
        );
        delete sanitized.promoted_object.custom_event_type;
      }
    }

    // If promoted_object is now empty, remove it
    if (Object.keys(sanitized.promoted_object).length === 0) {
      delete sanitized.promoted_object;
    }
  }

  return sanitized;
}

/**
 * Sanitize campaign payload
 */
export function sanitizeCampaignPayload(payload: any): any {
  const sanitized = { ...payload };

  // ABO mode: ensure is_adset_budget_sharing_enabled is false
  sanitized.is_adset_budget_sharing_enabled = false;

  // ABO mode: remove campaign-level budget fields
  delete sanitized.daily_budget;
  delete sanitized.lifetime_budget;
  delete sanitized.budget_remaining;

  return sanitized;
}
