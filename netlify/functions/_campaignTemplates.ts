export type CampaignType =
  | 'smart_link_probe'
  | 'one_click_sound'
  | 'follower_growth'
  | 'fan_capture';

export type DestinationType =
  | 'smart_link'
  | 'one_click_link'
  | 'platform_profile'
  | 'capture_page';

export interface CampaignTemplate {
  campaign_type: CampaignType;
  display_name: string;
  description: string;
  meta_objective: 'SALES';
  optimization_goal: 'LINK_CLICKS' | 'CONVERSIONS';
  allowed_destinations: DestinationType[];
  required_events: string[];
  ai_allowed_actions: string[];
  budget_cap_rules: BudgetCapRules;
  config: CampaignConfig;
}

export interface BudgetCapRules {
  min_daily_budget_cents: number;
  max_daily_budget_cents: number;
  max_total_budget_cents?: number;
  warm_audiences_only?: boolean;
  enforce_single_platform?: boolean;
  cost_per_lead_target_cents?: number;
}

export interface CampaignConfig {
  allow_auto_platform_detect?: boolean;
  track_platform_preference?: boolean;
  require_platform_selection?: boolean;
  single_platform_per_adset?: boolean;
  require_existing_engagement?: boolean;
  lookalike_min_source_size?: number;
  require_capture_page?: boolean;
  track_lead_quality?: boolean;
}

export interface AdSetRules {
  destination_type: DestinationType;
  destination_url: string;
  platform?: string;
  events_to_track: string[];
  optimization_event: string;
  audience_constraints?: AudienceConstraints;
}

export interface AudienceConstraints {
  warm_only?: boolean;
  min_engagement_level?: number;
  require_custom_audience?: boolean;
  exclude_cold_traffic?: boolean;
}

export const SMART_LINK_PROBE: CampaignTemplate = {
  campaign_type: 'smart_link_probe',
  display_name: 'Smart Link Campaign',
  description: 'Drive traffic to your smart link to test audience engagement across multiple platforms',
  meta_objective: 'SALES',
  optimization_goal: 'LINK_CLICKS',
  allowed_destinations: ['smart_link'],
  required_events: ['smartlinkclick', 'oneclickspotify', 'oneclickapple', 'oneclickyoutube'],
  ai_allowed_actions: ['scale_up', 'maintain', 'rotate_creative', 'pause'],
  budget_cap_rules: {
    min_daily_budget_cents: 500,
    max_daily_budget_cents: 50000,
    max_total_budget_cents: 500000,
  },
  config: {
    allow_auto_platform_detect: true,
    track_platform_preference: true,
  },
};

export const ONE_CLICK_SOUND: CampaignTemplate = {
  campaign_type: 'one_click_sound',
  display_name: 'One-Click Sound Promotion',
  description: 'Promote your track on a specific platform (Spotify, Apple Music, etc.) with direct one-click access',
  meta_objective: 'SALES',
  optimization_goal: 'LINK_CLICKS',
  allowed_destinations: ['one_click_link'],
  required_events: ['oneclicklink', 'oneclickspotify', 'oneclickapple', 'oneclickyoutube', 'oneclickamazon', 'oneclicktidal'],
  ai_allowed_actions: ['scale_up', 'maintain', 'test_variation', 'pause'],
  budget_cap_rules: {
    min_daily_budget_cents: 500,
    max_daily_budget_cents: 50000,
    enforce_single_platform: true,
  },
  config: {
    require_platform_selection: true,
    single_platform_per_adset: true,
  },
};

export const FOLLOWER_GROWTH: CampaignTemplate = {
  campaign_type: 'follower_growth',
  display_name: 'Follower Growth Campaign',
  description: 'Grow your social media following with warm audience targeting',
  meta_objective: 'SALES',
  optimization_goal: 'LINK_CLICKS',
  allowed_destinations: ['platform_profile'],
  required_events: ['profile_visit', 'follow_action'],
  ai_allowed_actions: ['scale_up', 'maintain', 'tighten_audience', 'pause'],
  budget_cap_rules: {
    min_daily_budget_cents: 1000,
    max_daily_budget_cents: 100000,
    warm_audiences_only: true,
  },
  config: {
    require_existing_engagement: true,
    lookalike_min_source_size: 1000,
  },
};

export const FAN_CAPTURE: CampaignTemplate = {
  campaign_type: 'fan_capture',
  display_name: 'Email & SMS Collection',
  description: 'Capture fan contact info (email/SMS) for direct communication and marketing automation',
  meta_objective: 'SALES',
  optimization_goal: 'CONVERSIONS',
  allowed_destinations: ['capture_page'],
  required_events: ['email_submit', 'sms_submit', 'capture_complete'],
  ai_allowed_actions: ['scale_up', 'maintain', 'rotate_creative', 'pause'],
  budget_cap_rules: {
    min_daily_budget_cents: 1000,
    max_daily_budget_cents: 50000,
    cost_per_lead_target_cents: 500,
  },
  config: {
    require_capture_page: true,
    track_lead_quality: true,
  },
};

export const CAMPAIGN_TEMPLATES: Record<CampaignType, CampaignTemplate> = {
  smart_link_probe: SMART_LINK_PROBE,
  one_click_sound: ONE_CLICK_SOUND,
  follower_growth: FOLLOWER_GROWTH,
  fan_capture: FAN_CAPTURE,
};

export function getAdSetRules(campaign_type: CampaignType, config: any): AdSetRules {
  const template = CAMPAIGN_TEMPLATES[campaign_type];

  switch (campaign_type) {
    case 'smart_link_probe':
      return {
        destination_type: 'smart_link',
        destination_url: config.smart_link_url,
        events_to_track: ['smartlinkclick', 'oneclickspotify', 'oneclickapple', 'oneclickyoutube'],
        optimization_event: 'smartlinkclick',
      };

    case 'one_click_sound':
      if (!config.platform) {
        throw new Error('Platform required for one-click campaigns');
      }
      return {
        destination_type: 'one_click_link',
        destination_url: config.one_click_url,
        platform: config.platform,
        events_to_track: ['oneclicklink', `oneclick${config.platform.toLowerCase()}`],
        optimization_event: 'oneclicklink',
      };

    case 'follower_growth':
      return {
        destination_type: 'platform_profile',
        destination_url: config.profile_url,
        platform: config.platform,
        events_to_track: ['profile_visit', 'follow_action'],
        optimization_event: 'profile_visit',
        audience_constraints: {
          warm_only: true,
          require_custom_audience: true,
          exclude_cold_traffic: true,
        },
      };

    case 'fan_capture':
      return {
        destination_type: 'capture_page',
        destination_url: config.capture_page_url,
        events_to_track: ['email_submit', 'sms_submit', 'capture_complete'],
        optimization_event: 'email_submit',
      };

    default:
      throw new Error(`Unknown campaign type: ${campaign_type}`);
  }
}

export function validateCampaignConfig(campaign_type: CampaignType, config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const template = CAMPAIGN_TEMPLATES[campaign_type];

  if (config.daily_budget_cents < template.budget_cap_rules.min_daily_budget_cents) {
    errors.push(`Daily budget must be at least $${template.budget_cap_rules.min_daily_budget_cents / 100}`);
  }

  if (config.daily_budget_cents > template.budget_cap_rules.max_daily_budget_cents) {
    errors.push(`Daily budget cannot exceed $${template.budget_cap_rules.max_daily_budget_cents / 100}`);
  }

  switch (campaign_type) {
    case 'smart_link_probe':
      if (!config.smart_link_url) {
        errors.push('Smart link URL required');
      }
      break;

    case 'one_click_sound':
      if (!config.one_click_url) {
        errors.push('One-click link URL required');
      }
      if (!config.platform) {
        errors.push('Platform selection required (spotify, applemusic, youtube, etc.)');
      }
      break;

    case 'follower_growth':
      if (!config.profile_url) {
        errors.push('Profile URL required');
      }
      if (!config.platform) {
        errors.push('Platform required');
      }
      break;

    case 'fan_capture':
      if (!config.capture_page_url) {
        errors.push('Capture page URL required');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getOptimizationEventName(campaign_type: CampaignType, platform?: string): string {
  switch (campaign_type) {
    case 'smart_link_probe':
      return 'smartlinkclick';
    case 'one_click_sound':
      return platform ? `oneclick${platform.toLowerCase()}` : 'oneclicklink';
    case 'follower_growth':
      return 'profile_visit';
    case 'fan_capture':
      return 'email_submit';
    default:
      return 'smartlinkclick';
  }
}
