/**
 * Pulse & Momentum Ads Operating Modes
 * Core types for testing vs scaling campaign management
 */

export type AdsMode = 'pulse' | 'momentum';
export type CampaignRole = 'testing' | 'scaling';

export interface PulseSettings {
  daily_budget?: number;
  test_lane_pct?: number;
  rotation_days?: number;
}

export interface MomentumSettings {
  starting_budget?: number;
  max_daily_budget?: number;
  scale_step_pct?: number;
  cooldown_hours?: number;
}

export interface GoalSettings {
  is_active: boolean;
  priority: number;
  budget_hint?: number;
  auto_scale?: boolean;
  testing_enabled?: boolean;
  scaling_enabled?: boolean;
}

export interface AdsModeSettings {
  ads_mode: AdsMode;
  pulse_settings: PulseSettings;
  momentum_settings: MomentumSettings;
  goal_settings: Record<string, GoalSettings>;
}

export const DEFAULT_PULSE_SETTINGS: PulseSettings = {
  daily_budget: 20,
  test_lane_pct: 30,
  rotation_days: 7,
};

export const DEFAULT_MOMENTUM_SETTINGS: MomentumSettings = {
  starting_budget: 50,
  max_daily_budget: 500,
  scale_step_pct: 20,
  cooldown_hours: 24,
};

export const DEFAULT_GOAL_SETTINGS: GoalSettings = {
  is_active: true,
  priority: 3,
  auto_scale: false,
  testing_enabled: true,
  scaling_enabled: false,
};

/**
 * Goal key mapping - must match template keys
 */
export const GOAL_KEY_MAP = {
  smartlink_conversions: 'smartlink_conversions',
  presave_conversions: 'presave_conversions',
  virality_engagement_thruplay_sound: 'virality',
  follower_growth_profile_visits: 'follower_growth',
  email_capture_leads: 'email_capture',
  oneclick_segmentation_sales: 'oneclick',
} as const;

export type GoalKey = keyof typeof GOAL_KEY_MAP | string;

/**
 * Core signal per goal for winner detection
 */
export const GOAL_CORE_SIGNALS: Record<string, string> = {
  smartlink_conversions: 'smartlinkclicked',
  presave_conversions: 'presavecomplete',
  virality: 'thruplay',
  follower_growth: 'profile_view',
  email_capture: 'lead',
  oneclick: 'oneclick_redirect',
};

/**
 * Winner detection thresholds (MVP - basic heuristics)
 */
export const WINNER_THRESHOLDS = {
  min_spend: 10, // $10 minimum spend
  min_impressions: 2000,
  improvement_pct: 15, // 15% better than median
};
