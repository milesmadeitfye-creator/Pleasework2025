import { CampaignType } from './_campaignTemplates';

export interface CampaignEvent {
  event_name: string;
  event_type: 'standard' | 'custom';
  meta_pixel_event: string;
  meta_capi_event: string;
  description: string;
}

export const CAMPAIGN_EVENTS: Record<string, CampaignEvent> = {
  smartlinkclick: {
    event_name: 'smartlinkclick',
    event_type: 'custom',
    meta_pixel_event: 'SmartLinkClicked',
    meta_capi_event: 'SmartLinkClicked',
    description: 'User clicked on smart link landing page',
  },
  oneclicklink: {
    event_name: 'oneclicklink',
    event_type: 'custom',
    meta_pixel_event: 'OneClickLinkClicked',
    meta_capi_event: 'OneClickLinkClicked',
    description: 'User clicked one-click link',
  },
  oneclickspotify: {
    event_name: 'oneclickspotify',
    event_type: 'custom',
    meta_pixel_event: 'SpotifyLinkClicked',
    meta_capi_event: 'SpotifyLinkClicked',
    description: 'User clicked Spotify one-click link',
  },
  oneclickapple: {
    event_name: 'oneclickapple',
    event_type: 'custom',
    meta_pixel_event: 'AppleMusicLinkClicked',
    meta_capi_event: 'AppleMusicLinkClicked',
    description: 'User clicked Apple Music one-click link',
  },
  oneclickyoutube: {
    event_name: 'oneclickyoutube',
    event_type: 'custom',
    meta_pixel_event: 'YouTubeLinkClicked',
    meta_capi_event: 'YouTubeLinkClicked',
    description: 'User clicked YouTube one-click link',
  },
  oneclickamazon: {
    event_name: 'oneclickamazon',
    event_type: 'custom',
    meta_pixel_event: 'AmazonMusicLinkClicked',
    meta_capi_event: 'AmazonMusicLinkClicked',
    description: 'User clicked Amazon Music one-click link',
  },
  oneclicktidal: {
    event_name: 'oneclicktidal',
    event_type: 'custom',
    meta_pixel_event: 'TidalLinkClicked',
    meta_capi_event: 'TidalLinkClicked',
    description: 'User clicked Tidal one-click link',
  },
  profile_visit: {
    event_name: 'profile_visit',
    event_type: 'custom',
    meta_pixel_event: 'ProfileVisit',
    meta_capi_event: 'ProfileVisit',
    description: 'User visited social profile',
  },
  follow_action: {
    event_name: 'follow_action',
    event_type: 'custom',
    meta_pixel_event: 'FollowAction',
    meta_capi_event: 'FollowAction',
    description: 'User followed social profile',
  },
  email_submit: {
    event_name: 'email_submit',
    event_type: 'standard',
    meta_pixel_event: 'Lead',
    meta_capi_event: 'Lead',
    description: 'User submitted email on capture page',
  },
  sms_submit: {
    event_name: 'sms_submit',
    event_type: 'custom',
    meta_pixel_event: 'SMSSubmit',
    meta_capi_event: 'SMSSubmit',
    description: 'User submitted SMS on capture page',
  },
  capture_complete: {
    event_name: 'capture_complete',
    event_type: 'standard',
    meta_pixel_event: 'CompleteRegistration',
    meta_capi_event: 'CompleteRegistration',
    description: 'User completed capture form (email + SMS)',
  },
};

export function getRequiredEventsForCampaignType(campaign_type: CampaignType): CampaignEvent[] {
  const eventNames: Record<CampaignType, string[]> = {
    smart_link_probe: ['smartlinkclick', 'oneclickspotify', 'oneclickapple', 'oneclickyoutube'],
    one_click_sound: ['oneclicklink'],
    follower_growth: ['profile_visit', 'follow_action'],
    fan_capture: ['email_submit', 'sms_submit', 'capture_complete'],
  };

  return eventNames[campaign_type].map(name => CAMPAIGN_EVENTS[name]);
}

export function getPlatformSpecificEvent(platform: string): CampaignEvent | null {
  const eventName = `oneclick${platform.toLowerCase()}`;
  return CAMPAIGN_EVENTS[eventName] || null;
}

export interface PixelTrackingPayload {
  event_name: string;
  meta_pixel_event: string;
  meta_capi_event: string;
  user_data?: {
    em?: string;
    ph?: string;
    client_ip_address?: string;
    client_user_agent?: string;
    fbp?: string;
    fbc?: string;
  };
  custom_data?: {
    campaign_id?: string;
    campaign_type?: string;
    platform?: string;
    link_id?: string;
    value?: number;
    currency?: string;
  };
}

export function buildPixelPayload(
  event_name: string,
  campaign_id: string,
  campaign_type: CampaignType,
  extra_data?: any
): PixelTrackingPayload {
  const event = CAMPAIGN_EVENTS[event_name];

  if (!event) {
    throw new Error(`Unknown event: ${event_name}`);
  }

  return {
    event_name: event.event_name,
    meta_pixel_event: event.meta_pixel_event,
    meta_capi_event: event.meta_capi_event,
    custom_data: {
      campaign_id,
      campaign_type,
      platform: extra_data?.platform,
      link_id: extra_data?.link_id,
      value: extra_data?.value || 1.0,
      currency: 'USD',
    },
  };
}

export function shouldFirePixelEvent(campaign_type: CampaignType, event_name: string): boolean {
  const requiredEvents = getRequiredEventsForCampaignType(campaign_type);
  return requiredEvents.some(e => e.event_name === event_name);
}
