/**
 * Smart Link Resolver Client
 * Frontend wrapper for smart-links-resolve-v2 endpoint
 */

import { safeNetlify } from "../safeNetlify";

export type ResolveSmartLinkInput = {
  // Audio identifiers
  audioUrl?: string;
  audioFilePath?: string;

  // Track identifiers
  isrc?: string;
  acrid?: string;
  spotifyUrl?: string;
  spotifyTrackId?: string;

  // User hints
  hintTitle?: string;
  hintArtist?: string;
  hintAlbum?: string;

  // Smart link ID (for updating existing link)
  smartLinkId?: string;

  // Options
  forceRefresh?: boolean;
};

export type ResolveSmartLinkResult = {
  success: boolean;
  resolverPath: "cache" | "acrcloud_strong" | "acrcloud_ok" | "fallback_only" | "acrcloud_failed_fallback" | "none";

  // Track metadata
  title?: string;
  artist?: string;
  album?: string;
  isrc?: string;
  durationMs?: number;
  coverImageUrl?: string;

  // Canonical URL
  canonicalUrl?: string;
  canonicalPlatform?: string;

  // Platform links
  platformLinks: {
    spotify?: string;
    appleMusic?: string;
    youtube?: string;
    youtubeMusic?: string;
    tidal?: string;
    deezer?: string;
    amazon?: string;
    soundcloud?: string;
  };

  // ACRCloud metadata
  acrcloud?: {
    acrid?: string;
    score?: number;
    title?: string;
    artists?: string[];
    album?: string;
    releaseDate?: string;
  };

  // Resolution metadata
  confidence: number;
  resolverSources: string[];
  trackResolutionId?: string;
  needsManualReview: boolean;

  error?: string;
};

/**
 * Resolve a smart link using the ACRCloud-first pipeline
 */
export async function resolveSmartLink(
  input: ResolveSmartLinkInput
): Promise<ResolveSmartLinkResult> {
  try {
    const response = await safeNetlify("/smart-links-resolve-v2", {
      method: "POST",
      body: JSON.stringify({
        audio_url: input.audioUrl,
        audio_file_path: input.audioFilePath,
        isrc: input.isrc,
        acrid: input.acrid,
        spotify_url: input.spotifyUrl,
        spotify_track_id: input.spotifyTrackId,
        hint_title: input.hintTitle,
        hint_artist: input.hintArtist,
        hint_album: input.hintAlbum,
        smart_link_id: input.smartLinkId,
        force_refresh: input.forceRefresh,
      }),
    });

    const data = await response.json();

    // Convert snake_case to camelCase for frontend
    return {
      success: data.success,
      resolverPath: data.resolver_path,
      title: data.title,
      artist: data.artist,
      album: data.album,
      isrc: data.isrc,
      durationMs: data.duration_ms,
      coverImageUrl: data.cover_image_url,
      canonicalUrl: data.canonical_url,
      canonicalPlatform: data.canonical_platform,
      platformLinks: {
        spotify: data.platform_links?.spotify,
        appleMusic: data.platform_links?.apple_music,
        youtube: data.platform_links?.youtube,
        youtubeMusic: data.platform_links?.youtube_music,
        tidal: data.platform_links?.tidal,
        deezer: data.platform_links?.deezer,
        amazon: data.platform_links?.amazon,
        soundcloud: data.platform_links?.soundcloud,
      },
      acrcloud: data.acrcloud
        ? {
            acrid: data.acrcloud.acrid,
            score: data.acrcloud.score,
            title: data.acrcloud.title,
            artists: data.acrcloud.artists,
            album: data.acrcloud.album,
            releaseDate: data.acrcloud.release_date,
          }
        : undefined,
      confidence: data.confidence || 0,
      resolverSources: data.resolver_sources || [],
      trackResolutionId: data.track_resolution_id,
      needsManualReview: data.needs_manual_review || false,
      error: data.error,
    };
  } catch (err: any) {
    console.error("[resolveSmartLink] Error:", err);
    return {
      success: false,
      resolverPath: "none",
      platformLinks: {},
      confidence: 0,
      resolverSources: [],
      needsManualReview: true,
      error: err?.message || "Failed to resolve smart link",
    };
  }
}

/**
 * Get a human-readable description of the resolver path
 */
export function getResolverPathLabel(path: string): string {
  switch (path) {
    case "cache":
      return "Cached";
    case "acrcloud_strong":
      return "ACRCloud (Strong Match)";
    case "acrcloud_ok":
      return "ACRCloud (Good Match)";
    case "fallback_only":
      return "Fallback Resolver";
    case "acrcloud_failed_fallback":
      return "Fallback (ACRCloud Failed)";
    case "none":
      return "Unresolved";
    default:
      return "Unknown";
  }
}

/**
 * Get a color indicator for confidence level
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "text-green-500";
  if (confidence >= 0.65) return "text-yellow-500";
  return "text-red-500";
}

/**
 * Get a label for confidence level
 */
export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return "High Confidence";
  if (confidence >= 0.65) return "Medium Confidence";
  if (confidence >= 0.5) return "Low Confidence";
  return "Very Low Confidence";
}
