/**
 * Meta Ad Campaign Placement Constants
 * Maps to Marketing API publisher_platforms, facebook_positions, instagram_positions
 */

export type PlacementPlatform = "facebook" | "instagram";

export type PlacementGroup = "feeds" | "stories_reels" | "search" | "profile";

export type PlacementOption = {
  id: string;
  label: string;
  platform: PlacementPlatform;
  group: PlacementGroup;
};

export const PLACEMENT_OPTIONS: PlacementOption[] = [
  // FACEBOOK – FEEDS
  { id: "feed", label: "Facebook Feed", platform: "facebook", group: "feeds" },

  // FACEBOOK – STORIES & REELS
  { id: "story", label: "Facebook Stories", platform: "facebook", group: "stories_reels" },
  { id: "reels", label: "Facebook Reels", platform: "facebook", group: "stories_reels" },

  // FACEBOOK – SEARCH
  { id: "search", label: "Facebook Search Results", platform: "facebook", group: "search" },

  // FACEBOOK – PROFILE
  { id: "profile_feed", label: "Facebook Profile Feed", platform: "facebook", group: "profile" },

  // INSTAGRAM – FEEDS
  { id: "stream", label: "Instagram Feed", platform: "instagram", group: "feeds" },

  // INSTAGRAM – STORIES & REELS
  { id: "story", label: "Instagram Stories", platform: "instagram", group: "stories_reels" },
  { id: "reels", label: "Instagram Reels", platform: "instagram", group: "stories_reels" },

  // INSTAGRAM – SEARCH
  { id: "search", label: "Instagram Search Results", platform: "instagram", group: "search" },

  // INSTAGRAM – PROFILE
  { id: "profile_feed", label: "Instagram Profile Feed", platform: "instagram", group: "profile" },
  { id: "profile_reels", label: "Instagram Profile Reels", platform: "instagram", group: "profile" },
];

export const PLACEMENT_GROUPS: Array<{ id: PlacementGroup; label: string }> = [
  { id: "feeds", label: "Feeds" },
  { id: "stories_reels", label: "Stories & Reels" },
  { id: "search", label: "Search" },
  { id: "profile", label: "Profile" },
];

// Default automatic placements (broad coverage)
export const AUTOMATIC_FACEBOOK_POSITIONS = ["feed", "story", "reels", "search"];
export const AUTOMATIC_INSTAGRAM_POSITIONS = ["stream", "story", "reels", "search", "profile_feed", "profile_reels"];
