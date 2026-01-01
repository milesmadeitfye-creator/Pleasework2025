/**
 * Meta Template Registry
 *
 * Single source of truth for Meta campaign objectives, optimization, and specs.
 * Prevents defaulting to generic TRAFFIC campaigns.
 *
 * Each template defines:
 * - Meta objective (OUTCOME_TRAFFIC, OUTCOME_SALES, OUTCOME_AWARENESS, etc.)
 * - Optimization goal
 * - Billing event
 * - Placement strategy
 * - Targeting approach
 * - Required assets
 */

export interface MetaTemplateSpec {
  template_key: string;
  name: string;
  description: string;

  // Meta API configuration
  objective: string; // e.g., OUTCOME_TRAFFIC, OUTCOME_SALES
  optimization_goal: string; // e.g., LINK_CLICKS, OFFSITE_CONVERSIONS
  billing_event?: string; // e.g., LINK_CLICKS, IMPRESSIONS

  // Targeting
  targeting_strategy: 'broad' | 'retarget' | 'lookalike' | 'custom';
  requires_custom_audience?: boolean;
  requires_lookalike_audience?: boolean;

  // Creative requirements
  required_assets: Array<'image' | 'video' | 'headline' | 'body' | 'cta'>;
  recommended_aspect_ratios: string[]; // e.g., ['1:1', '9:16', '4:5']

  // Conversion tracking
  requires_pixel?: boolean;
  pixel_event?: string; // e.g., 'SmartLinkClicked', 'PreSaveComplete'

  // Placement
  placement_strategy: 'advantage_plus' | 'manual' | 'instagram_only' | 'facebook_only';

  // Budget guidance
  min_daily_budget_usd?: number;
  recommended_daily_budget_usd?: number;
}

export const META_TEMPLATE_REGISTRY: Record<string, MetaTemplateSpec> = {
  // Smart Link / Streams
  smartlink_conversions: {
    template_key: 'smartlink_conversions',
    name: 'Smart Link Conversions',
    description: 'Drive traffic to smart links with conversion optimization',
    objective: 'OUTCOME_TRAFFIC',
    optimization_goal: 'LINK_CLICKS',
    billing_event: 'LINK_CLICKS',
    targeting_strategy: 'broad',
    required_assets: ['video', 'headline', 'body', 'cta'],
    recommended_aspect_ratios: ['1:1', '4:5', '9:16'],
    requires_pixel: true,
    pixel_event: 'SmartLinkClicked',
    placement_strategy: 'advantage_plus',
    min_daily_budget_usd: 5,
    recommended_daily_budget_usd: 20,
  },

  // Pre-Save Campaigns
  presave_conversions: {
    template_key: 'presave_conversions',
    name: 'Pre-Save Conversions',
    description: 'Convert fans to pre-saves before release',
    objective: 'OUTCOME_TRAFFIC',
    optimization_goal: 'LINK_CLICKS',
    billing_event: 'LINK_CLICKS',
    targeting_strategy: 'broad',
    required_assets: ['image', 'video', 'headline', 'body', 'cta'],
    recommended_aspect_ratios: ['1:1', '4:5'],
    requires_pixel: true,
    pixel_event: 'PreSaveComplete',
    placement_strategy: 'advantage_plus',
    min_daily_budget_usd: 10,
    recommended_daily_budget_usd: 30,
  },

  // Virality / Engagement
  virality_engagement_thruplay_sound: {
    template_key: 'virality_engagement_thruplay_sound',
    name: 'Virality with ThruPlay',
    description: 'Maximize video views and engagement with sound promotion',
    objective: 'OUTCOME_ENGAGEMENT',
    optimization_goal: 'THRUPLAY',
    billing_event: 'IMPRESSIONS',
    targeting_strategy: 'broad',
    required_assets: ['video', 'headline', 'body'],
    recommended_aspect_ratios: ['9:16', '1:1', '4:5'],
    requires_pixel: false,
    placement_strategy: 'advantage_plus',
    min_daily_budget_usd: 20,
    recommended_daily_budget_usd: 50,
  },

  // Lead Generation
  email_capture_leads: {
    template_key: 'email_capture_leads',
    name: 'Email Capture & Leads',
    description: 'Build email list and capture fan information',
    objective: 'OUTCOME_LEADS',
    optimization_goal: 'LEAD',
    billing_event: 'IMPRESSIONS',
    targeting_strategy: 'broad',
    required_assets: ['image', 'video', 'headline', 'body', 'cta'],
    recommended_aspect_ratios: ['1:1', '4:5'],
    requires_pixel: false,
    placement_strategy: 'advantage_plus',
    min_daily_budget_usd: 15,
    recommended_daily_budget_usd: 40,
  },

  // Follower Growth
  follower_growth_profile_visits: {
    template_key: 'follower_growth_profile_visits',
    name: 'Follower Growth via Profile Visits',
    description: 'Drive traffic to social profiles to grow followers',
    objective: 'OUTCOME_TRAFFIC',
    optimization_goal: 'LINK_CLICKS',
    billing_event: 'LINK_CLICKS',
    targeting_strategy: 'broad',
    required_assets: ['image', 'video', 'headline', 'body', 'cta'],
    recommended_aspect_ratios: ['1:1', '9:16'],
    requires_pixel: false,
    placement_strategy: 'instagram_only',
    min_daily_budget_usd: 10,
    recommended_daily_budget_usd: 25,
  },

  // One-Click Segmentation
  oneclick_segmentation_sales: {
    template_key: 'oneclick_segmentation_sales',
    name: 'One-Click Fan Segmentation',
    description: 'Identify high-value fans with conversion tracking',
    objective: 'OUTCOME_SALES',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event: 'IMPRESSIONS',
    targeting_strategy: 'broad',
    required_assets: ['video', 'headline', 'body', 'cta'],
    recommended_aspect_ratios: ['1:1', '4:5', '9:16'],
    requires_pixel: true,
    pixel_event: 'OneClickRedirect',
    placement_strategy: 'advantage_plus',
    min_daily_budget_usd: 20,
    recommended_daily_budget_usd: 50,
  },

  // Retargeting Template
  retarget_website_30d: {
    template_key: 'retarget_website_30d',
    name: 'Retarget Website Visitors (30 Days)',
    description: 'Re-engage users who visited your website in the past 30 days',
    objective: 'OUTCOME_TRAFFIC',
    optimization_goal: 'LINK_CLICKS',
    billing_event: 'LINK_CLICKS',
    targeting_strategy: 'retarget',
    requires_custom_audience: true,
    required_assets: ['image', 'video', 'headline', 'body', 'cta'],
    recommended_aspect_ratios: ['1:1', '4:5'],
    requires_pixel: true,
    placement_strategy: 'advantage_plus',
    min_daily_budget_usd: 5,
    recommended_daily_budget_usd: 15,
  },

  // Lookalike Expansion
  lookalike_broad_expansion: {
    template_key: 'lookalike_broad_expansion',
    name: 'Lookalike Audience Expansion',
    description: 'Target users similar to your best fans',
    objective: 'OUTCOME_TRAFFIC',
    optimization_goal: 'LINK_CLICKS',
    billing_event: 'LINK_CLICKS',
    targeting_strategy: 'lookalike',
    requires_lookalike_audience: true,
    required_assets: ['video', 'headline', 'body', 'cta'],
    recommended_aspect_ratios: ['1:1', '9:16'],
    requires_pixel: false,
    placement_strategy: 'advantage_plus',
    min_daily_budget_usd: 15,
    recommended_daily_budget_usd: 35,
  },

  // Awareness / Brand
  awareness_brand_reach: {
    template_key: 'awareness_brand_reach',
    name: 'Brand Awareness & Reach',
    description: 'Maximize impressions and brand exposure',
    objective: 'OUTCOME_AWARENESS',
    optimization_goal: 'REACH',
    billing_event: 'IMPRESSIONS',
    targeting_strategy: 'broad',
    required_assets: ['image', 'video', 'headline', 'body'],
    recommended_aspect_ratios: ['1:1', '9:16', '4:5'],
    requires_pixel: false,
    placement_strategy: 'advantage_plus',
    min_daily_budget_usd: 10,
    recommended_daily_budget_usd: 30,
  },
};

/**
 * Get template spec by key
 */
export function getTemplateSpec(templateKey: string): MetaTemplateSpec | null {
  return META_TEMPLATE_REGISTRY[templateKey] || null;
}

/**
 * Get template spec by goal key (fallback mapping)
 */
export function getTemplateSpecByGoal(goalKey: string): MetaTemplateSpec | null {
  const goalToTemplate: Record<string, string> = {
    streams: 'smartlink_conversions',
    presave: 'presave_conversions',
    virality: 'virality_engagement_thruplay_sound',
    build_audience: 'email_capture_leads',
    followers: 'follower_growth_profile_visits',
    fan_segmentation: 'oneclick_segmentation_sales',
  };

  const templateKey = goalToTemplate[goalKey];
  return templateKey ? getTemplateSpec(templateKey) : null;
}

/**
 * Validate that required fields are present for a template
 */
export function validateTemplateRequirements(
  templateKey: string,
  config: {
    hasPixel?: boolean;
    hasCustomAudience?: boolean;
    hasLookalikeAudience?: boolean;
    hasVideo?: boolean;
    hasImage?: boolean;
  }
): { valid: boolean; errors: string[] } {
  const spec = getTemplateSpec(templateKey);
  if (!spec) {
    return { valid: false, errors: [`Template ${templateKey} not found`] };
  }

  const errors: string[] = [];

  if (spec.requires_pixel && !config.hasPixel) {
    errors.push(`Template requires Meta Pixel with event: ${spec.pixel_event}`);
  }

  if (spec.requires_custom_audience && !config.hasCustomAudience) {
    errors.push('Template requires a custom audience (retargeting)');
  }

  if (spec.requires_lookalike_audience && !config.hasLookalikeAudience) {
    errors.push('Template requires a lookalike audience');
  }

  if (spec.required_assets.includes('video') && !config.hasVideo) {
    errors.push('Template requires video creative');
  }

  if (spec.required_assets.includes('image') && !config.hasImage) {
    errors.push('Template requires image creative');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get all available template keys
 */
export function getAllTemplateKeys(): string[] {
  return Object.keys(META_TEMPLATE_REGISTRY);
}
