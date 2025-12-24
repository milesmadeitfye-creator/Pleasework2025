/**
 * Ghoste AI Tool Registry
 * Central registry of all actions Ghoste AI can take across the app
 * Maps tool IDs to actual Netlify functions and frontend routes
 */

export type GhosteToolId =
  | "show_help"
  | "navigate_dashboard"
  | "create_smart_link"
  | "list_smart_links"
  | "refresh_spotify_stats"
  | "sync_spotify_artist"
  | "create_calendar_task"
  | "list_calendar_tasks"
  | "create_calendar_event"
  | "list_calendar_events"
  | "open_split_negotiations"
  | "create_split_negotiation"
  | "open_unreleased_music"
  | "open_fan_communication"
  | "open_ad_campaigns"
  | "create_meta_campaign"
  | "get_meta_accounts"
  | "sync_mailchimp_contacts"
  | "get_mailchimp_lists"
  | "fan_email_blast"
  | "fan_sms_blast"
  | "open_cover_art_generator"
  | "generate_cover_art"
  | "open_social_media_scheduler"
  | "open_marketing_university"
  | "open_connected_accounts"
  | "open_billing"
  | "open_account_settings"
  | "open_links"
  | "open_wallet"
  | "add_fan_contact"
  | "list_uploads"
  | "resolve_upload";

export type GhosteTool = {
  id: GhosteToolId;
  description: string;
  // Optional: which Netlify function to hit (must match actual function name)
  netlifyFunction?: string;
  // Optional: which frontend route to navigate to
  frontendRoute?: string;
  // Optional: parameters this tool accepts
  parameters?: Record<string, { type: string; description: string; required?: boolean }>;
  // Optional: feature key for credit spending (matches FEATURE_COSTS)
  featureKey?: string;
};

export const GHOSTE_TOOLS: GhosteTool[] = [
  {
    id: "show_help",
    description:
      "Explain what Ghoste can do: smart links, AI assistant with calendar reminders, tasks, wallet, listening parties, split negotiations, unreleased music, fan communication, ad campaigns, cover art generator, social media scheduler, marketing university, connected accounts, billing, and account settings.",
  },
  {
    id: "navigate_dashboard",
    description: "Navigate to the main analytics dashboard to see streaming stats and performance metrics.",
    frontendRoute: "/dashboard",
  },
  {
    id: "create_smart_link",
    description:
      "Create a new smart link for a release or track. Smart links aggregate all platform URLs (Spotify, Apple Music, YouTube, etc.) into one shareable link.",
    netlifyFunction: "link-create",
    featureKey: "link_create_smart",
    parameters: {
      title: { type: "string", description: "Song/album title", required: true },
      slug: { type: "string", description: "URL slug (e.g., 'my-song')", required: true },
      spotify_url: { type: "string", description: "Spotify URL", required: false },
      apple_music_url: { type: "string", description: "Apple Music URL", required: false },
      youtube_url: { type: "string", description: "YouTube URL", required: false },
    },
  },
  {
    id: "list_smart_links",
    description: "List all existing smart links for this user.",
    netlifyFunction: "list-user-links",
  },
  {
    id: "refresh_spotify_stats",
    description:
      "Refresh Spotify artist statistics for the connected artist profile. Fetches latest streaming numbers, listeners, and track performance.",
    netlifyFunction: "spotify-refresh-stats",
  },
  {
    id: "sync_spotify_artist",
    description:
      "Sync Spotify artist profile data including tracks, albums, and analytics.",
    netlifyFunction: "spotify-artist-sync",
  },
  {
    id: "create_calendar_task",
    description:
      "Create a task in the Ghoste To-Do / Calendar for a given title and optional date/time. Use this for release reminders, marketing tasks, social media posts, etc.",
    netlifyFunction: "tasks-create",
    featureKey: "ai_calendar_task",
    parameters: {
      title: { type: "string", description: "Task title", required: true },
      description: { type: "string", description: "Task description", required: false },
      due_at: { type: "string", description: "ISO datetime (YYYY-MM-DDTHH:MM:SSZ)", required: false },
      priority: { type: "string", description: "Priority: low, medium, high", required: false },
    },
  },
  {
    id: "list_calendar_tasks",
    description: "List upcoming tasks from the Ghoste To-Do / Calendar.",
    netlifyFunction: "tasks-list",
  },
  {
    id: "create_calendar_event",
    description:
      "Create a calendar reminder/event for the user inside Ghoste. Use this when the user asks to be reminded of something or to put something on their calendar. For example: 'remind me tomorrow at 3pm to upload my single' or 'put studio session on Friday at 7pm on my calendar'. The AI must convert natural language times to precise UTC ISO timestamps.",
    netlifyFunction: "ai-calendar-create",
    featureKey: "ai_calendar_event",
    parameters: {
      userId: { type: "string", description: "User ID (from current session)", required: true },
      title: { type: "string", description: "Event title, e.g. 'Upload new single' or 'Studio session with Miles'", required: true },
      description: { type: "string", description: "Optional longer description or notes for the event", required: false },
      start_at_iso: {
        type: "string",
        description: "ISO 8601 timestamp (UTC) when the event starts, e.g. '2025-12-08T20:00:00Z'. The AI must convert from the user's local phrasing into UTC.",
        required: true,
      },
      end_at_iso: {
        type: "string",
        description: "Optional ISO 8601 timestamp (UTC) when the event ends",
        required: false,
      },
      reminder_minutes_before: {
        type: "number",
        description: "How many minutes before the event to send the reminder email. Default is 60 (1 hour).",
        required: false,
      },
      channel: {
        type: "string",
        description: "Where to send reminders: 'email', 'sms', or 'both'. Default is 'email'. Use 'both' if user explicitly asks for SMS and email.",
        required: false,
      },
    },
  },
  {
    id: "list_calendar_events",
    description: "List upcoming calendar events and reminders created by the user. Shows scheduled events with their times and reminder settings.",
    netlifyFunction: "ai-calendar-list",
    parameters: {
      userId: { type: "string", description: "User ID (from current session)", required: true },
    },
  },
  {
    id: "open_split_negotiations",
    description: "Navigate to the Split Negotiations page where you can manage songwriter/producer splits and generate contracts.",
    frontendRoute: "/dashboard?tab=split-negotiations",
  },
  {
    id: "create_split_negotiation",
    description:
      "Create a new split negotiation for a track between collaborators. Generates a split sheet contract.",
    netlifyFunction: "create-split-negotiation",
    featureKey: "split_negotiation_create",
    parameters: {
      track_title: { type: "string", description: "Track title", required: true },
      participants: {
        type: "array",
        description: "Array of {name, email, split_percentage}",
        required: true,
      },
    },
  },
  {
    id: "open_unreleased_music",
    description: "Navigate to the Unreleased Music page where you can upload and share private music with fans before release.",
    frontendRoute: "/dashboard?tab=unreleased-music",
  },
  {
    id: "open_fan_communication",
    description: "Navigate to the Fan Communication page for email/SMS flows and audience engagement tools.",
    frontendRoute: "/dashboard?tab=fan-communication",
  },
  {
    id: "open_ad_campaigns",
    description:
      "Navigate to the Ad Campaigns page for creating and managing Meta (Facebook/Instagram) advertising campaigns.",
    frontendRoute: "/dashboard?tab=ad-campaigns",
  },
  {
    id: "create_meta_campaign",
    description:
      "Create a Meta (Facebook/Instagram) ad campaign. Requires Meta account to be connected. Use this to promote releases, build audience, and drive streams.",
    netlifyFunction: "meta-create-campaign",
    featureKey: "meta_launch_campaign",
    parameters: {
      name: { type: "string", description: "Campaign name", required: true },
      budget: { type: "number", description: "Daily budget in USD", required: true },
      objective: { type: "string", description: "Campaign objective", required: false },
    },
  },
  {
    id: "get_meta_accounts",
    description: "Get connected Meta ad accounts, Facebook pages, and Instagram profiles.",
    netlifyFunction: "meta-accounts",
  },
  {
    id: "sync_mailchimp_contacts",
    description:
      "Sync fan contacts from Ghoste to the connected Mailchimp audience. Requires Mailchimp to be connected.",
    netlifyFunction: "mailchimp-sync-contacts",
  },
  {
    id: "get_mailchimp_lists",
    description: "Get all Mailchimp audiences (lists) for the connected account.",
    netlifyFunction: "mailchimp-get-lists",
  },
  {
    id: "open_cover_art_generator",
    description: "Navigate to the AI Cover Art generator where you can create artwork for releases.",
    frontendRoute: "/dashboard?tab=cover-art",
  },
  {
    id: "generate_cover_art",
    description:
      "Generate AI cover art based on a text prompt. Creates professional album/single artwork.",
    netlifyFunction: "generate-cover-art",
    featureKey: "cover_art_demo",
    parameters: {
      prompt: { type: "string", description: "Description of the artwork", required: true },
      style: { type: "string", description: "Art style (e.g., minimalist, abstract)", required: false },
    },
  },
  {
    id: "open_social_media_scheduler",
    description: "Navigate to the Social Media page for scheduling and posting content.",
    frontendRoute: "/dashboard?tab=social-media",
  },
  {
    id: "open_marketing_university",
    description: "Navigate to Marketing University for courses, tutorials, and marketing education.",
    frontendRoute: "/dashboard?tab=marketing-university",
  },
  {
    id: "open_connected_accounts",
    description: "Navigate to Connected Accounts settings to manage integrations (Spotify, Meta, Mailchimp, TikTok, etc.).",
    frontendRoute: "/dashboard?tab=connected-accounts",
  },
  {
    id: "open_billing",
    description: "Navigate to billing / subscription management page to upgrade to Ghoste Pro or manage payment.",
    frontendRoute: "/dashboard?tab=billing",
  },
  {
    id: "open_account_settings",
    description: "Navigate to account settings page to update profile, email, password, etc.",
    frontendRoute: "/dashboard?tab=account-settings",
  },
  {
    id: "open_links",
    description: "Navigate to the Links page to view and manage all smart links, pre-save campaigns, and email capture pages.",
    frontendRoute: "/dashboard?tab=links",
  },
  {
    id: "open_wallet",
    description: "Navigate to the Wallet page to view balance, transactions, and manage payouts.",
    frontendRoute: "/dashboard?tab=wallet",
  },
  {
    id: "add_fan_contact",
    description: "Add a new fan contact to the database. Useful for collecting emails from various sources.",
    netlifyFunction: "add-fan-contact",
    parameters: {
      email: { type: "string", description: "Fan email address", required: true },
      name: { type: "string", description: "Fan name", required: false },
      source: { type: "string", description: "Source of contact (e.g., 'concert', 'social media')", required: false },
    },
  },
  {
    id: "fan_email_blast",
    description: "Send an email blast to a Mailchimp audience list or segment. Perfect for announcing releases, shows, or updates to your entire fan base.",
    netlifyFunction: "mailchimp-fan-email-blast",
    featureKey: "fan_broadcast_email",
    parameters: {
      userId: { type: "string", description: "User ID", required: true },
      listId: { type: "string", description: "Mailchimp list ID", required: true },
      segmentId: { type: "string", description: "Optional Mailchimp segment ID to target specific fans", required: false },
      subject: { type: "string", description: "Email subject line", required: true },
      html: { type: "string", description: "HTML email content", required: true },
      fromName: { type: "string", description: "From name (default: Ghoste Artist)", required: false },
      replyTo: { type: "string", description: "Reply-to email (default: no-reply@ghoste.one)", required: false },
    },
  },
  {
    id: "fan_sms_blast",
    description: "Send a text message blast to fans with phone numbers in your audience. Use for urgent updates and personal touches.",
    netlifyFunction: "twilio-send-sms",
    featureKey: "fan_broadcast_sms",
    parameters: {
      toNumbers: { type: "array", description: "Array of phone numbers in E.164 format", required: true },
      message: { type: "string", description: "SMS message content (keep under 160 chars)", required: true },
    },
  },
  {
    id: "list_uploads",
    description: "List all uploaded media files (videos, images, audio) for the current user. Returns up to 50 most recent uploads with filename, type, and upload date. ALWAYS use this when the user mentions 'the video I uploaded', 'my uploaded file', or similar. Never ask them to re-upload or confirm filenames - just call this tool.",
    netlifyFunction: "uploads-tool",
    parameters: {},
  },
  {
    id: "resolve_upload",
    description: "Get a usable URL for a specific uploaded file by ID or filename. Returns a public or signed URL that can be used for Meta ads, AI processing, or other purposes. Use this after list_uploads when you need to actually use the file.",
    netlifyFunction: "uploads-tool",
    parameters: {
      uploadId: { type: "string", description: "Upload ID from list_uploads", required: false },
      filename: { type: "string", description: "Filename to search for (case-insensitive partial match)", required: false },
    },
  },
];

/**
 * Get a tool by ID
 */
export function getToolById(id: GhosteToolId): GhosteTool | undefined {
  return GHOSTE_TOOLS.find((t) => t.id === id);
}

/**
 * Get all tools that have Netlify functions
 */
export function getExecutableTools(): GhosteTool[] {
  return GHOSTE_TOOLS.filter((t) => t.netlifyFunction);
}

/**
 * Get all navigation tools
 */
export function getNavigationTools(): GhosteTool[] {
  return GHOSTE_TOOLS.filter((t) => t.frontendRoute);
}

/**
 * Format tools for OpenAI function calling
 */
export function getToolsForOpenAI() {
  return GHOSTE_TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.id,
      description: tool.description,
      parameters: {
        type: "object",
        properties: tool.parameters || {},
        required: Object.entries(tool.parameters || {})
          .filter(([_, param]) => param.required)
          .map(([name]) => name),
      },
    },
  }));
}
