/**
 * Ghoste Ads Templates System
 * Top-level campaign templates that determine objective, optimization, and destination mode
 */

export type AdsTemplateKey =
  | 'oneclick_segmentation_sales'
  | 'virality_engagement_thruplay_sound'
  | 'follower_growth_profile_visits'
  | 'email_capture_leads';

export type DestinationMode =
  | 'oneclick_redirect'
  | 'native_sound'
  | 'native_profile'
  | 'lead_form';

export interface PlatformDestinations {
  facebook_sound_url?: string;
  tiktok_sound_url?: string;
  instagram_profile_url?: string;
  facebook_page_url?: string;
  tiktok_profile_url?: string;
  lead_url?: string;
}

export interface AdsTemplateRecord {
  id: string;
  template_key: AdsTemplateKey;
  title: string;
  purpose: string;
  core_signal: string;
  objective: string;
  optimization_goal: string;
  destination_mode: DestinationMode;
  platform_destinations?: PlatformDestinations;
  tracking_events: string[];
  is_active: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AdsTemplateSelection {
  template_key: AdsTemplateKey;
  platform_destinations?: PlatformDestinations;
}

export const TEMPLATE_DETAILS: Record<AdsTemplateKey, {
  displayName: string;
  description: string;
  icon: string;
  requiresSound: boolean;
  requiresProfile?: boolean;
  requiresLeadUrl?: boolean;
}> = {
  oneclick_segmentation_sales: {
    displayName: 'One-Click Segmentation (Sales)',
    description: 'Segmentation-only campaign using SALES objective with custom event optimization for oneclick conversions',
    icon: 'target',
    requiresSound: false,
  },
  virality_engagement_thruplay_sound: {
    displayName: 'Virality + Engagement (ThruPlay)',
    description: 'Optimize for ThruPlays and engagement using platform-native sound URLs (Facebook/TikTok sounds)',
    icon: 'volume-2',
    requiresSound: true,
  },
  follower_growth_profile_visits: {
    displayName: 'Follower Growth (Profile Visits)',
    description: 'Drive profile visits and follower growth using native platform profile URLs (Instagram/Facebook/TikTok)',
    icon: 'user-plus',
    requiresSound: false,
    requiresProfile: true,
  },
  email_capture_leads: {
    displayName: 'Email Capture (Leads)',
    description: 'Generate leads through Ghoste email capture forms with LEADS objective optimization',
    icon: 'mail',
    requiresSound: false,
    requiresLeadUrl: true,
  },
};
