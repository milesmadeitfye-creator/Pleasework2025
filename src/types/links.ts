// Unified link type system for all link types
export type UnifiedLinkType =
  | 'smart'           // Smart Links (music platform aggregator)
  | 'one_click'       // One-Click Links (direct deep link)
  | 'email_capture'   // Email Capture Links
  | 'presave'         // Pre-Save Links
  | 'listening_party' // Listening Party Links
  | 'show'            // Show Links (live events)
  | 'bio';            // Link in Bio (profile hub)

// Legacy link types for marketing system
export type LinkType = 'capture_email' | 'capture_sms' | 'pre_save';

export type BaseLinkCreate = {
  type: LinkType;
  title: string;
  slug?: string;
  pixel_enabled?: boolean;
  capi_enabled?: boolean;
};

export type CaptureSettings = {
  fields: ('email' | 'phone')[];
  tags?: string[];
  require_consent_email?: boolean;
  require_consent_sms?: boolean;
  template_name?: string;
};

export type PreSaveSettings = {
  upc_or_isrc: string;
  platforms: ('spotify' | 'apple')[];
  cover_art_url?: string;
  forever_save?: boolean;
  template_name?: string;
};

export type LinkSettings = CaptureSettings | PreSaveSettings;

export type LinkCreatePayload = BaseLinkCreate & {
  settings: LinkSettings;
};

// Unified link config types
export interface BaseLinkConfig {
  // Shared settings across all link types
}

export interface SmartLinkConfig extends BaseLinkConfig {
  // Smart links use existing column structure
  // No additional config needed - uses table columns directly
}

export interface ShowLinkConfig extends BaseLinkConfig {
  showTitle?: string;
  venueName?: string;
  city?: string;
  address?: string;
  dateIso?: string;         // ISO datetime for the show
  doorsTimeIso?: string | null;
  ticketUrl?: string;
  additionalInfo?: string;
}

export interface BioLinkHighlight {
  label: string;
  url: string;
}

export interface BioLinkConfig extends BaseLinkConfig {
  displayName?: string;
  tagline?: string;
  avatarUrl?: string | null;
  primaryButtonLabel?: string;
  primaryButtonUrl?: string;
  spotifyUrl?: string;
  appleMusicUrl?: string;
  youtubeUrl?: string;
  soundcloudUrl?: string;
  tidalUrl?: string;
  tiktokUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  otherSocialUrl?: string;
  highlights?: BioLinkHighlight[];
}

export interface PreSavePlatformConfig {
  enabled: boolean;
  url?: string;
}

export interface PreSaveLinkConfig extends BaseLinkConfig {
  releaseTitle?: string;
  releaseDateIso?: string;      // ISO datetime for release
  coverImageUrl?: string | null;
  description?: string;
  isrc?: string;                // Optional ISRC for manual resolution

  // Platform-specific pre-save links
  spotify?: PreSavePlatformConfig;
  appleMusic?: PreSavePlatformConfig;
  tidal?: PreSavePlatformConfig;
  youtubeMusic?: PreSavePlatformConfig;
  deezer?: PreSavePlatformConfig;

  // Optional email capture for this pre-save campaign
  captureEmail?: boolean;
}

export type UnifiedLinkConfig =
  | SmartLinkConfig
  | ShowLinkConfig
  | BioLinkConfig
  | PreSaveLinkConfig;

export type MarketingLink = {
  id: string;
  owner_id: string;
  type: LinkType;
  title: string;
  slug: string | null;
  settings: LinkSettings;
  pixel_enabled: boolean;
  capi_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type FanContact = {
  id: string;
  owner_id: string;
  source_link_id: string | null;
  email: string | null;
  phone_e164: string | null;
  phone?: string | null;
  consent_email: boolean;
  consent_sms: boolean;
  subscribed?: boolean;
  meta: Record<string, any>;
  created_at: string;
};

export type PreSavePledge = {
  id: string;
  link_id: string;
  owner_id: string;
  platform: 'spotify' | 'apple';
  fan_contact_id: string | null;
  status: 'pledged' | 'completed';
  created_at: string;
};
