/**
 * Ghoste Ads Templates System
 * Top-level campaign templates that determine objective, optimization, and destination mode
 */

export type AdsTemplateKey = 'oneclick_segmentation_sales' | 'virality_engagement_thruplay_sound';

export type DestinationMode = 'oneclick_redirect' | 'native_sound';

export interface PlatformDestinations {
  facebook_sound_url?: string;
  tiktok_sound_url?: string;
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
};
