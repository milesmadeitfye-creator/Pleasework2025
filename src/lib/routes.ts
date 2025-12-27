/**
 * Centralized route constants
 * Use these throughout the app to avoid typos and ensure consistency
 */
export const ROUTES = {
  // Public
  landing: '/',
  auth: '/auth',
  help: '/help',

  // Dashboard
  overview: '/dashboard/overview',
  calendar: '/calendar',
  wallet: '/wallet',
  analytics: '/analytics',
  links: '/links',
  manager: '/manager',

  // Studio
  studio: '/studio',
  studioGettingStarted: '/studio/getting-started',
  studioSmartLinks: '/studio/smart-links',
  studioAdCampaigns: '/studio/ad-campaigns',
  studioGhosteAi: '/studio/ghoste-ai',
  studioCoverArt: '/studio/cover-art',
  studioMusicVisuals: '/studio/music-visuals',
  studioSocialMedia: '/studio/social-media',
  studioFanCommunication: '/studio/fan-communication',
  studioListeningParties: '/studio/listening-parties',
  studioSplits: '/studio/splits',
  studioUnreleasedMusic: '/studio/unreleased-music',

  // Ads
  adsAutopilot: '/ads/autopilot',
  adsVerificationInbox: '/ads/verification-inbox',
  adsAutopilotLog: '/ads/autopilot-log',

  // Profile
  profile: '/profile',
  profileOverview: '/profile/overview',
  profileConnect: '/profile/connect-accounts',

  // Settings
  settings: '/settings',

  // Success pages
  success: '/success',
  checkoutSuccess: '/checkout/success',
  tokensSuccess: '/tokens-success',

  // Subscriptions
  subscriptions: '/subscriptions',
} as const;
