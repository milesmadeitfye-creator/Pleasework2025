/**
 * Central Feature Pricing Map
 *
 * Defines credit costs for all paid actions in Ghoste.
 * This is the single source of truth for feature pricing on the frontend.
 */

export type CreditPool = "manager" | "tools";

export type FeatureCost = {
  pool: CreditPool;
  amount: number;
  requiresPro?: boolean;
  label?: string;
};

export const FEATURE_COSTS: Record<string, FeatureCost> = {
  // ============================================================
  // MANAGER CREDITS (High-cost strategic features, mostly Pro)
  // ============================================================

  // Ad Campaigns
  meta_launch_campaign: {
    pool: "manager",
    amount: 3000,
    requiresPro: true,
    label: "Meta ad launch",
  },
  tiktok_launch_campaign: {
    pool: "manager",
    amount: 2500,
    requiresPro: true,
    label: "TikTok ad launch",
  },
  viral_lead_setup: {
    pool: "manager",
    amount: 2000,
    requiresPro: true,
    label: "Viral funnel setup",
  },

  // Release Planning
  release_campaign_plan: {
    pool: "manager",
    amount: 1500,
    requiresPro: true,
    label: "Release campaign plan",
  },
  ai_release_plan: {
    pool: "manager",
    amount: 500,
    requiresPro: true,
    label: "AI release plan",
  },

  // Fan Communication
  fan_broadcast_email: {
    pool: "manager",
    amount: 1000,
    requiresPro: true,
    label: "Fan email blast",
  },
  fan_broadcast_sms: {
    pool: "manager",
    amount: 1200,
    requiresPro: true,
    label: "Fan SMS blast",
  },
  fan_auto_welcome_flow: {
    pool: "manager",
    amount: 800,
    requiresPro: true,
    label: "Welcome flow",
  },
  ai_fan_message_batch: {
    pool: "manager",
    amount: 400,
    requiresPro: true,
    label: "AI fan message batch",
  },

  // Events
  listening_party_host: {
    pool: "manager",
    amount: 800,
    requiresPro: true,
    label: "Listening party",
  },

  // ============================================================
  // TOOLS CREDITS (Utility & rendering actions)
  // ============================================================

  // Links
  create_smart_link: {
    pool: "tools",
    amount: 50,
    label: "Smart link",
  },
  link_create_smart: {
    pool: "tools",
    amount: 50,
    label: "Smart link",
  },
  link_create_oneclick: {
    pool: "tools",
    amount: 20,
    label: "One-click link",
  },
  link_create_presave: {
    pool: "tools",
    amount: 80,
    label: "Pre-save link",
  },
  link_create_tipjar: {
    pool: "tools",
    amount: 60,
    label: "Tip/donation link",
  },
  link_create_submission: {
    pool: "tools",
    amount: 70,
    label: "Submission link",
  },
  link_create_onelink_page: {
    pool: "tools",
    amount: 120,
    label: "Link-in-bio page",
  },
  smart_link_pro_template: {
    pool: "tools",
    amount: 75,
    requiresPro: true,
    label: "Pro smart link template",
  },

  // Social Media
  social_single_post: {
    pool: "tools",
    amount: 60,
    label: "Scheduled post",
  },
  social_multi_platform_post: {
    pool: "tools",
    amount: 120,
    label: "Multi-platform post",
  },
  social_content_calendar_generate: {
    pool: "tools",
    amount: 200,
    requiresPro: true,
    label: "Content calendar",
  },

  // Fan Tools
  fan_segment_builder: {
    pool: "tools",
    amount: 150,
    label: "Build fan segment",
  },
  listening_party_reminders: {
    pool: "tools",
    amount: 100,
    label: "Party reminders",
  },

  // Unreleased Music & Splits
  unreleased_upload_track: {
    pool: "tools",
    amount: 100,
    label: "Upload unreleased track",
  },
  unreleased_feedback_session: {
    pool: "tools",
    amount: 250,
    requiresPro: true,
    label: "Feedback session",
  },
  split_negotiation_create: {
    pool: "tools",
    amount: 40,
    label: "Split negotiation",
  },
  split_contract_export: {
    pool: "tools",
    amount: 200,
    requiresPro: true,
    label: "Split agreement export",
  },

  // AI & Content Generation
  ai_copy: {
    pool: "tools",
    amount: 75,
    label: "AI copy",
  },
  ai_calendar_task: {
    pool: "tools",
    amount: 10,
    label: "AI task creation",
  },
  ai_calendar_event: {
    pool: "tools",
    amount: 10,
    label: "AI calendar reminder",
  },
  ai_assistant_routine: {
    pool: "tools",
    amount: 50,
    label: "AI assistant task",
  },
  ai_sms_compose: {
    pool: "tools",
    amount: 75,
    label: "AI SMS draft",
  },
  cover_art_hd: {
    pool: "tools",
    amount: 800,
    requiresPro: true,
    label: "HD cover art",
  },
  cover_art_demo: {
    pool: "tools",
    amount: 200,
    label: "Demo cover art",
  },
  video_render: {
    pool: "tools",
    amount: 1500,
    requiresPro: true,
    label: "Video render",
  },

  // Misc Tools
  playlist_pitch_template: {
    pool: "tools",
    amount: 150,
    label: "Playlist pitch template",
  },
};

export function getFeatureCost(featureKey: string): FeatureCost | undefined {
  return FEATURE_COSTS[featureKey];
}
