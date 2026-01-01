/**
 * Canonical Overall Goals Registry
 * Single source of truth for platform-agnostic user goals
 */

export type OverallGoalKey =
  | 'virality'
  | 'build_audience'
  | 'streams'
  | 'followers'
  | 'presave'
  | 'fan_segmentation';

export type RequiredAsset =
  | 'smartlink_url'
  | 'presave_url'
  | 'lead_url'
  | 'sound_urls'
  | 'profile_urls'
  | 'none';

export interface GoalDefinition {
  title: string;
  description: string;
  coreSignal: string;
  requiredAssets: RequiredAsset[];
  defaultTemplateKeys: string[];
}

/**
 * Canonical goal registry - maps overall goals to ads implementation
 */
export const GOAL_REGISTRY: Record<OverallGoalKey, GoalDefinition> = {
  virality: {
    title: 'Virality',
    description: 'Maximize views, shares, and engagement on social media',
    coreSignal: 'thruplay',
    requiredAssets: ['sound_urls'],
    defaultTemplateKeys: ['virality_engagement_thruplay_sound'],
  },
  build_audience: {
    title: 'Build My Audience',
    description: 'Grow your email list and capture leads',
    coreSignal: 'lead',
    requiredAssets: ['lead_url'],
    defaultTemplateKeys: ['email_capture_leads'],
  },
  streams: {
    title: 'Get Streams',
    description: 'Drive clicks to streaming platforms',
    coreSignal: 'smartlinkclicked',
    requiredAssets: ['smartlink_url'],
    defaultTemplateKeys: ['smartlink_conversions'],
  },
  followers: {
    title: 'Grow Followers',
    description: 'Increase social media followers',
    coreSignal: 'profile_view',
    requiredAssets: ['profile_urls'],
    defaultTemplateKeys: ['follower_growth_profile_visits'],
  },
  presave: {
    title: 'Pre-Save Campaign',
    description: 'Convert fans to pre-saves before release',
    coreSignal: 'presavecomplete',
    requiredAssets: ['presave_url'],
    defaultTemplateKeys: ['presave_conversions'],
  },
  fan_segmentation: {
    title: 'Fan Segmentation',
    description: 'Identify and segment high-value fans',
    coreSignal: 'oneclick_redirect',
    requiredAssets: ['none'],
    defaultTemplateKeys: ['oneclick_segmentation_sales'],
  },
};

/**
 * Get all overall goal keys
 */
export function getAllGoalKeys(): OverallGoalKey[] {
  return Object.keys(GOAL_REGISTRY) as OverallGoalKey[];
}

/**
 * Get goal definition by key
 */
export function getGoalDefinition(goalKey: OverallGoalKey): GoalDefinition | null {
  return GOAL_REGISTRY[goalKey] || null;
}

/**
 * Check if a goal requires specific assets
 */
export function goalRequiresAssets(goalKey: OverallGoalKey): boolean {
  const goal = GOAL_REGISTRY[goalKey];
  return goal ? !goal.requiredAssets.includes('none') : false;
}

/**
 * Get human-readable asset requirements for a goal
 */
export function getAssetRequirementsText(goalKey: OverallGoalKey): string {
  const goal = GOAL_REGISTRY[goalKey];
  if (!goal) return 'Unknown goal';

  if (goal.requiredAssets.includes('none')) {
    return 'No setup needed';
  }

  const assetLabels: Record<RequiredAsset, string> = {
    smartlink_url: 'Smart Link URL',
    presave_url: 'Pre-Save Link URL',
    lead_url: 'Lead Form URL',
    sound_urls: 'Facebook & TikTok Sound URLs',
    profile_urls: 'Social Profile URLs',
    none: 'None',
  };

  return goal.requiredAssets.map(asset => assetLabels[asset]).join(', ');
}
