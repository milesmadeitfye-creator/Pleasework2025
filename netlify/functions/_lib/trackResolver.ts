/**
 * Multi-Source Track Resolver
 * File: netlify/functions/_lib/trackResolver.ts
 *
 * ACRCloud-First Resolution Policy:
 * 1. Database cache (track_resolutions)
 * 2. ACRCloud Metadata API (primary source)
 * 3. Spotify/Apple Search (fallback only when ACRCloud fails or low confidence)
 *
 * Returns unified TrackResolution with confidence scoring and resolver path tracking
 */
import { getSpotifyAccessToken, spotifyGet } from "./spotifyClient";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ACRCloud confidence thresholds
const ACRCLOUD_CONFIDENCE_MIN = 0.70; // Accept as truth, no fallback
const ACRCLOUD_CONFIDENCE_FALLBACK = 0.55; // Below this, allow search fallback
const ACRCLOUD_REQUIRED_PLATFORMS = ["spotify_url", "apple_music_url"]; // Must have at least one

export type TrackResolution = {
  isrc?: string;
  title?: string;
  artist?: string;
  album?: string;
  duration_ms?: number;

  spotify_track_id?: string;
  spotify_url?: string;
  apple_music_id?: string;
  apple_music_url?: string;
  youtube_url?: string;
  deezer_url?: string;

  acrid?: string;
  acrcloud_raw?: any;

  resolver_sources: string[];
  confidence: number; // 0..1
  status: "resolved" | "partial" | "needs_review";

  resolver_path?: "acrcloud_only" | "acrcloud_then_search" | "search_only" | "cache";
  fallback_reason?: "no_match" | "low_confidence" | "missing_platform_ids" | null;
};

export type ResolveInput = {
  isrc?: string;
  spotify_url?: string;
  spotify_track_id?: string;
  apple_music_url?: string;
  apple_music_id?: string;
  acrid?: string;
  query?: string; // "artist title"
  title?: string;
  artist?: string;
  force_search_fallback?: boolean; // Force search even if ACRCloud succeeds
};

/**
 * Main resolver function - ACRCloud first, search only as fallback
 */
export async function resolveTrack(input: ResolveInput): Promise<TrackResolution> {
  console.log("[TrackResolver] Starting resolution with input:", input);

  // Extract IDs from URLs if provided
  if (input.spotify_url && !input.spotify_track_id) {
    input.spotify_track_id = extractSpotifyTrackId(input.spotify_url);
  }
  if (input.apple_music_url && !input.apple_music_id) {
    input.apple_music_id = extractAppleMusicId(input.apple_music_url);
  }

  // 1. Check database cache first
  const cached = await checkCache(input);
  if (cached && cached.confidence >= 0.75) {
    console.log("[TrackResolver] Using cached resolution with confidence:", cached.confidence);
    cached.resolver_path = "cache";
    cached.fallback_reason = null;
    return cached;
  }

  // 2. Try ACRCloud first (primary source)
  console.log("[TrackResolver] Attempting ACRCloud resolution (primary)");
  const acrData = await tryACRCloud(input);

  // 3. Evaluate ACRCloud result and decide if fallback is needed
  let resolution: TrackResolution = {
    resolver_sources: [],
    confidence: 0,
    status: "needs_review",
    resolver_path: "search_only",
    fallback_reason: null,
  };

  let needsFallback = false;
  let fallbackReason: "no_match" | "low_confidence" | "missing_platform_ids" | null = null;

  if (!acrData) {
    // No ACRCloud match - must use search fallback
    console.log("[TrackResolver] ACRCloud returned no match, falling back to search");
    needsFallback = true;
    fallbackReason = "no_match";
  } else {
    // ACRCloud found something, evaluate confidence
    resolution = mergeResolution(resolution, acrData);
    const acrConfidence = calculateConfidence(resolution);

    console.log("[TrackResolver] ACRCloud confidence:", acrConfidence);

    if (acrConfidence < ACRCLOUD_CONFIDENCE_FALLBACK) {
      // Confidence too low - use search fallback
      console.log("[TrackResolver] ACRCloud confidence below threshold, falling back to search");
      needsFallback = true;
      fallbackReason = "low_confidence";
    } else if (acrConfidence < ACRCLOUD_CONFIDENCE_MIN || input.force_search_fallback) {
      // Check if we have required platform IDs
      const hasRequiredPlatforms = ACRCLOUD_REQUIRED_PLATFORMS.some(
        (platform) => resolution[platform as keyof TrackResolution]
      );

      if (!hasRequiredPlatforms || input.force_search_fallback) {
        console.log("[TrackResolver] ACRCloud missing critical platform IDs or force fallback, adding search");
        needsFallback = true;
        fallbackReason = "missing_platform_ids";
      } else {
        // ACRCloud is sufficient - no fallback needed
        console.log("[TrackResolver] ACRCloud resolution sufficient, no fallback needed");
        resolution.resolver_path = "acrcloud_only";
      }
    } else {
      // High confidence ACRCloud result
      console.log("[TrackResolver] ACRCloud high confidence, no fallback needed");
      resolution.resolver_path = "acrcloud_only";
    }
  }

  // 4. Run search fallback if needed
  if (needsFallback) {
    console.log("[TrackResolver] Running search fallback");

    // Try Spotify
    const spotifyData = await trySpotify(input);
    if (spotifyData) {
      resolution = mergeResolution(resolution, spotifyData, true); // preserve ACRCloud title/artist
    }

    // Try Apple Music (if configured)
    const appleData = await tryAppleMusic(input);
    if (appleData) {
      resolution = mergeResolution(resolution, appleData, true); // preserve ACRCloud title/artist
    }

    // Update resolver path
    resolution.resolver_path = acrData ? "acrcloud_then_search" : "search_only";
    resolution.fallback_reason = fallbackReason;
  }

  // 5. Calculate final confidence and status
  resolution.confidence = calculateConfidence(resolution);
  resolution.status = getStatus(resolution.confidence);

  console.log("[TrackResolver] Final resolution:", {
    sources: resolution.resolver_sources,
    confidence: resolution.confidence,
    status: resolution.status,
    resolver_path: resolution.resolver_path,
    fallback_reason: resolution.fallback_reason,
  });

  return resolution;
}

/**
 * Check database cache for existing resolution
 */
async function checkCache(input: ResolveInput): Promise<TrackResolution | null> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let query = supabase.from("track_resolutions").select("*");

  if (input.isrc) {
    query = query.eq("isrc", input.isrc);
  } else if (input.spotify_track_id) {
    query = query.eq("spotify_track_id", input.spotify_track_id);
  } else if (input.acrid) {
    query = query.eq("acrid", input.acrid);
  } else {
    return null; // No cacheable identifier
  }

  const { data } = await query.maybeSingle();

  if (data) {
    return {
      ...data,
      resolver_sources: data.resolver_sources || [],
      confidence: data.confidence || 0,
      status: data.status || "needs_review",
    };
  }

  return null;
}

/**
 * Try resolving via Spotify
 */
async function trySpotify(input: ResolveInput): Promise<Partial<TrackResolution> | null> {
  try {
    const token = await getSpotifyAccessToken();
    let track: any = null;

    // If we have a track ID, get directly
    if (input.spotify_track_id) {
      track = await spotifyGet(`https://api.spotify.com/v1/tracks/${input.spotify_track_id}`, token);
    }
    // If we have ISRC, search by ISRC (most accurate)
    else if (input.isrc) {
      const searchResult = await spotifyGet(
        `https://api.spotify.com/v1/search?q=isrc:${encodeURIComponent(input.isrc)}&type=track&limit=1`,
        token
      );
      track = searchResult?.tracks?.items?.[0];
    }
    // Otherwise, fuzzy search by title + artist or query
    else if (input.query || (input.title && input.artist)) {
      const searchQuery = input.query || `${input.artist} ${input.title}`;
      const searchResult = await spotifyGet(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=1`,
        token
      );
      track = searchResult?.tracks?.items?.[0];
    }

    if (!track) {
      return null;
    }

    console.log("[TrackResolver] Spotify found:", track.name, "by", track.artists[0]?.name);

    return {
      isrc: track.external_ids?.isrc || undefined,
      title: track.name,
      artist: track.artists?.[0]?.name,
      album: track.album?.name,
      duration_ms: track.duration_ms,
      spotify_track_id: track.id,
      spotify_url: track.external_urls?.spotify,
      resolver_sources: ["spotify"],
    };
  } catch (err: any) {
    console.log("[TrackResolver] Spotify search failed:", err.message);
    return null;
  }
}

/**
 * Try resolving via Apple Music
 * Note: Stub implementation - Apple Music API requires JWT tokens
 */
async function tryAppleMusic(input: ResolveInput): Promise<Partial<TrackResolution> | null> {
  // Check if Apple Music is configured
  const hasAppleConfig =
    process.env.APPLE_MUSIC_TEAM_ID && process.env.APPLE_MUSIC_KEY_ID && process.env.APPLE_MUSIC_PRIVATE_KEY;

  if (!hasAppleConfig) {
    console.log("[TrackResolver] Apple Music not configured, skipping");
    return null;
  }

  // TODO: Implement Apple Music API search when credentials are configured
  // Would need to generate JWT token and call /v1/catalog/us/search
  console.log("[TrackResolver] Apple Music search not yet implemented");
  return null;
}

/**
 * Try resolving via ACRCloud - builds complete platform URLs from external IDs
 * Uses platformLinkNormalizer to ensure all IDs/URIs become real URLs
 */
async function tryACRCloud(input: ResolveInput): Promise<Partial<TrackResolution> | null> {
  try {
    const params = new URLSearchParams();

    if (input.isrc) {
      params.set("isrc", input.isrc);
    } else if (input.acrid) {
      params.set("acrid", input.acrid);
    } else if (input.spotify_url) {
      params.set("source_url", input.spotify_url);
    } else if (input.query || (input.title && input.artist)) {
      params.set("query", input.query || `${input.artist} ${input.title}`);
    } else {
      return null;
    }

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || "http://localhost:8888";
    const response = await fetch(`${siteUrl}/.netlify/functions/acrcloud-metadata-links?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`ACRCloud returned ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      console.log("[TrackResolver] ACRCloud found no results");
      return null;
    }

    const track = data.data[0];
    console.log("[TrackResolver] ACRCloud found:", track.name, "by", track.artists?.[0]?.name);

    // Import normalizer (dynamic to avoid circular deps)
    const { normalizePlatformLinks } = await import("./platformLinkNormalizer");

    // Normalize all platform links from ACRCloud external_metadata
    const normalized = normalizePlatformLinks({
      external_metadata: track.external_metadata,
    });

    console.log("[TrackResolver] Normalized ACRCloud links:", {
      links: normalized.normalized_links,
      notes: normalized.notes,
    });

    return {
      isrc: normalized.raw_ids.isrc || track.external_ids?.isrc || undefined,
      title: track.name,
      artist: track.artists?.[0]?.name,
      album: track.album?.name,
      duration_ms: track.duration_ms,
      spotify_track_id: normalized.raw_ids.spotify_track_id || undefined,
      spotify_url: normalized.normalized_links.spotify || undefined,
      apple_music_id: normalized.raw_ids.apple_music_id || undefined,
      apple_music_url: normalized.normalized_links.apple_music || undefined,
      youtube_url: normalized.normalized_links.youtube || undefined,
      deezer_url: normalized.normalized_links.deezer || undefined,
      acrid: track.acrid,
      acrcloud_raw: track,
      resolver_sources: ["acrcloud"],
    };
  } catch (err: any) {
    console.log("[TrackResolver] ACRCloud search failed:", err.message);
    return null;
  }
}

/**
 * Merge two resolutions, preferring non-null values
 * @param preserveMetadata If true, preserves existing title/artist (for ACRCloud + search fallback)
 */
function mergeResolution(
  base: TrackResolution,
  addition: Partial<TrackResolution>,
  preserveMetadata = false
): TrackResolution {
  const merged = { ...base };

  // Merge all fields, preferring non-null values
  for (const key of Object.keys(addition) as Array<keyof TrackResolution>) {
    if (addition[key] !== undefined && addition[key] !== null) {
      if (key === "resolver_sources") {
        merged.resolver_sources = [
          ...merged.resolver_sources,
          ...(addition.resolver_sources || []),
        ];
      } else if (preserveMetadata && (key === "title" || key === "artist" || key === "album")) {
        // Preserve existing metadata if flag is set (ACRCloud takes priority)
        if (!merged[key]) {
          (merged as any)[key] = addition[key];
        }
      } else {
        // Fill in missing fields only
        if (!(merged as any)[key]) {
          (merged as any)[key] = addition[key];
        }
      }
    }
  }

  return merged;
}

/**
 * Calculate confidence score based on available data
 * - ISRC found: +0.55
 * - Spotify track ID: +0.25
 * - Apple Music ID: +0.15
 * - 2+ sources agree on title/artist: +0.1
 */
function calculateConfidence(resolution: TrackResolution): number {
  let confidence = 0;

  if (resolution.isrc) confidence += 0.55;
  if (resolution.spotify_track_id) confidence += 0.25;
  if (resolution.apple_music_id) confidence += 0.15;
  if (resolution.resolver_sources.length >= 2) confidence += 0.1;

  return Math.min(confidence, 1.0);
}

/**
 * Determine status based on confidence
 */
function getStatus(confidence: number): "resolved" | "partial" | "needs_review" {
  if (confidence >= 0.75) return "resolved";
  if (confidence >= 0.5) return "partial";
  return "needs_review";
}

/**
 * Extract Spotify track ID from URL
 */
function extractSpotifyTrackId(url: string): string | undefined {
  const match = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return match?.[1];
}

/**
 * Extract Apple Music ID from URL
 */
function extractAppleMusicId(url: string): string | undefined {
  const match = url.match(/music\.apple\.com\/.*\/album\/.*\/(\d+)/);
  return match?.[1];
}

/**
 * String similarity helper for fuzzy matching
 */
function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  if (aLower === bLower) return 1.0;

  // Simple character-based similarity
  const longer = aLower.length > bLower.length ? aLower : bLower;
  const shorter = aLower.length > bLower.length ? bLower : aLower;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
