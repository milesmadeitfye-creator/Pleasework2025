/**
 * Smart Link Resolver Pipeline
 * ACRCloud-First with Intelligent Fallback
 *
 * Pipeline Order:
 * 1. Cache check (track_resolutions table)
 * 2. ACRCloud identify (primary resolver)
 * 3. Spotify/AUDD fallback (if ACRCloud fails or confidence too low)
 * 4. Merge + normalize + canonical selection
 * 5. Cache results for future use
 */

import { createClient } from "@supabase/supabase-js";
import { getSpotifyAccessToken, spotifyGet } from "./spotifyClient";

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Confidence thresholds (tunable)
const CONF_STRONG = 0.80; // Accept immediately
const CONF_OK = 0.65;     // Accept if title/artist similarity looks good
const CONF_MIN = 0.50;    // Minimum to consider

// Platform priority for canonical URL selection
const PLATFORM_PRIORITY = [
  "spotify",
  "apple_music",
  "youtube_music",
  "youtube",
  "tidal",
  "deezer",
  "amazon",
  "soundcloud"
];

export type ResolverInput = {
  // Audio identifiers (for ACRCloud)
  audio_url?: string;
  audio_file_path?: string;

  // Track identifiers (for cache lookup / search)
  isrc?: string;
  acrid?: string;
  spotify_url?: string;
  spotify_track_id?: string;

  // User hints (for fuzzy matching / fallback)
  hint_title?: string;
  hint_artist?: string;
  hint_album?: string;

  // Smart link ID (for updating existing link)
  smart_link_id?: string;

  // Options
  force_refresh?: boolean; // Skip cache
};

export type ResolverResult = {
  success: boolean;
  resolver_path: "cache" | "acrcloud_strong" | "acrcloud_ok" | "fallback_only" | "acrcloud_failed_fallback" | "none";

  // Track metadata
  title?: string;
  artist?: string;
  album?: string;
  isrc?: string;
  duration_ms?: number;
  cover_image_url?: string;

  // Canonical URL (deterministic selection)
  canonical_url?: string;
  canonical_platform?: string;

  // Platform links
  platform_links: {
    spotify?: string;
    apple_music?: string;
    youtube?: string;
    youtube_music?: string;
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
    release_date?: string;
    raw?: any;
  };

  // Resolution metadata
  confidence: number;
  resolver_sources: string[];
  track_resolution_id?: string;
  needs_manual_review: boolean;

  error?: string;
};

/**
 * Main resolver pipeline
 */
export async function resolveSmartLink(input: ResolverInput): Promise<ResolverResult> {
  console.log("[SmartLinkResolver] Starting pipeline with input:", {
    has_audio_url: !!input.audio_url,
    has_isrc: !!input.isrc,
    has_acrid: !!input.acrid,
    has_spotify_url: !!input.spotify_url,
    has_hints: !!(input.hint_title && input.hint_artist),
    force_refresh: input.force_refresh,
  });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // STEP 1: Check cache (unless force_refresh)
  if (!input.force_refresh) {
    const cached = await checkCache(supabase, input);
    if (cached) {
      console.log("[SmartLinkResolver] Cache hit with confidence:", cached.confidence);
      return {
        ...cached,
        resolver_path: "cache",
      };
    }
  }

  // STEP 2: Try ACRCloud (primary resolver)
  let acrResult: Partial<ResolverResult> | null = null;
  let acrError: string | null = null;

  try {
    acrResult = await tryACRCloud(input);
  } catch (err: any) {
    console.warn("[SmartLinkResolver] ACRCloud failed:", err.message);
    acrError = err.message;
  }

  // STEP 3: Evaluate ACRCloud confidence
  if (acrResult && acrResult.confidence) {
    // Strong match - accept immediately
    if (acrResult.confidence >= CONF_STRONG) {
      console.log("[SmartLinkResolver] ACRCloud strong match:", acrResult.confidence);
      const final = await finalizeResolution(supabase, acrResult, "acrcloud_strong", input);
      return final;
    }

    // OK match - validate with string similarity if we have hints
    if (acrResult.confidence >= CONF_OK) {
      const similarity = validateWithHints(acrResult, input);
      if (similarity >= 0.7) {
        console.log("[SmartLinkResolver] ACRCloud OK match (validated):", acrResult.confidence, "similarity:", similarity);
        const final = await finalizeResolution(supabase, acrResult, "acrcloud_ok", input);
        return final;
      } else {
        console.log("[SmartLinkResolver] ACRCloud OK but similarity too low:", similarity);
      }
    }

    // Low confidence - keep as candidate but try fallback
    console.log("[SmartLinkResolver] ACRCloud confidence too low:", acrResult.confidence);
  }

  // STEP 4: Fallback resolver (Spotify search / manual)
  let fallbackResult: Partial<ResolverResult> | null = null;

  try {
    fallbackResult = await tryFallbackResolver(input);
  } catch (err: any) {
    console.warn("[SmartLinkResolver] Fallback resolver failed:", err.message);
  }

  // STEP 5: Merge results (prefer ACRCloud if it exists, fill gaps with fallback)
  let mergedResult: Partial<ResolverResult> | null = null;

  if (acrResult && fallbackResult) {
    // Both succeeded - merge intelligently
    mergedResult = mergeResults(acrResult, fallbackResult);
    const final = await finalizeResolution(supabase, mergedResult, "acrcloud_failed_fallback", input);
    return final;
  } else if (acrResult) {
    // Only ACRCloud - use it even if confidence is low
    const final = await finalizeResolution(supabase, acrResult, "acrcloud_ok", input);
    return final;
  } else if (fallbackResult) {
    // Only fallback - better than nothing
    const final = await finalizeResolution(supabase, fallbackResult, "fallback_only", input);
    return final;
  }

  // STEP 6: Complete failure
  console.error("[SmartLinkResolver] All resolvers failed");
  return {
    success: false,
    resolver_path: "none",
    platform_links: {},
    confidence: 0,
    resolver_sources: [],
    needs_manual_review: true,
    error: acrError || "All resolvers failed",
  };
}

/**
 * Check cache for existing resolution
 */
async function checkCache(supabase: any, input: ResolverInput): Promise<ResolverResult | null> {
  let query = supabase.from("track_resolutions").select("*");

  // Try different cache keys in priority order
  if (input.acrid) {
    query = query.eq("acrid", input.acrid);
  } else if (input.isrc) {
    query = query.eq("isrc", input.isrc);
  } else if (input.spotify_track_id) {
    query = query.eq("spotify_track_id", input.spotify_track_id);
  } else {
    return null; // No cacheable identifier
  }

  const { data, error } = await query.order("confidence", { ascending: false }).limit(1).maybeSingle();

  if (error || !data) {
    return null;
  }

  // Only use cache if confidence is decent
  if (data.confidence < CONF_MIN) {
    console.log("[SmartLinkResolver] Cache entry exists but confidence too low:", data.confidence);
    return null;
  }

  return {
    success: true,
    resolver_path: "cache",
    title: data.title || undefined,
    artist: data.artist || undefined,
    album: data.album || undefined,
    isrc: data.isrc || undefined,
    duration_ms: data.duration_ms || undefined,
    canonical_url: data.spotify_url || data.apple_music_url || data.youtube_url || undefined,
    canonical_platform: determineCanonicalPlatform({
      spotify: data.spotify_url,
      apple_music: data.apple_music_url,
      youtube: data.youtube_url,
    }),
    platform_links: {
      spotify: data.spotify_url || undefined,
      apple_music: data.apple_music_url || undefined,
      youtube: data.youtube_url || undefined,
      deezer: data.deezer_url || undefined,
    },
    acrcloud: data.acrid ? {
      acrid: data.acrid,
      raw: data.acrcloud_raw,
    } : undefined,
    confidence: data.confidence || 0,
    resolver_sources: data.resolver_sources || [],
    track_resolution_id: data.id,
    needs_manual_review: data.status === "needs_review",
  };
}

/**
 * Try ACRCloud resolver
 */
async function tryACRCloud(input: ResolverInput): Promise<Partial<ResolverResult> | null> {
  const params = new URLSearchParams();

  // Build ACRCloud query
  if (input.acrid) {
    params.set("acrid", input.acrid);
  } else if (input.isrc) {
    params.set("isrc", input.isrc);
  } else if (input.spotify_url) {
    params.set("source_url", input.spotify_url);
  } else if (input.audio_url) {
    params.set("source_url", input.audio_url);
  } else if (input.hint_title && input.hint_artist) {
    params.set("query", `${input.hint_artist} ${input.hint_title}`);
  } else {
    console.log("[SmartLinkResolver] No ACRCloud identifier available");
    return null;
  }

  const siteUrl = process.env.URL || process.env.DEPLOY_URL || "http://localhost:8888";
  const url = `${siteUrl}/.netlify/functions/acrcloud-metadata-links?${params.toString()}`;

  console.log("[SmartLinkResolver] Calling ACRCloud:", params.toString());

  const response = await fetch(url, { method: "GET" });

  if (!response.ok) {
    throw new Error(`ACRCloud returned ${response.status}`);
  }

  const data = await response.json();

  if (!data.data || data.data.length === 0) {
    console.log("[SmartLinkResolver] ACRCloud found no matches");
    return null;
  }

  const track = data.data[0];
  const score = track.score || 100; // ACRCloud returns 0-100 score

  console.log("[SmartLinkResolver] ACRCloud found:", track.name, "score:", score);

  // Import normalizer (dynamic to avoid circular deps)
  const { normalizePlatformLinks } = await import("./platformLinkNormalizer");

  // Normalize all platform links from ACRCloud external_metadata
  const normalized = normalizePlatformLinks({
    external_metadata: track.external_metadata,
  });

  console.log("[SmartLinkResolver] Normalized ACRCloud links:", {
    links: normalized.normalized_links,
    notes: normalized.notes,
  });

  return {
    title: track.name || undefined,
    artist: track.artists?.[0]?.name || undefined,
    album: track.album?.name || undefined,
    isrc: normalized.raw_ids.isrc || track.external_ids?.isrc || undefined,
    duration_ms: track.duration_ms || undefined,
    cover_image_url: track.album?.images?.[0]?.url || undefined,
    platform_links: normalized.normalized_links,
    acrcloud: {
      acrid: track.acrid,
      score: score / 100, // Normalize to 0-1
      title: track.name,
      artists: track.artists?.map((a: any) => a.name) || [],
      album: track.album?.name,
      release_date: track.release_date,
      raw: track,
    },
    confidence: score / 100, // Normalize to 0-1
    resolver_sources: ["acrcloud"],
    needs_manual_review: false,
  };
}

/**
 * Try fallback resolver (Spotify search)
 */
async function tryFallbackResolver(input: ResolverInput): Promise<Partial<ResolverResult> | null> {
  // If we have a Spotify URL, extract track ID and fetch directly
  if (input.spotify_url || input.spotify_track_id) {
    const trackId = input.spotify_track_id || extractSpotifyTrackId(input.spotify_url!);
    if (trackId) {
      try {
        const token = await getSpotifyAccessToken();
        const track = await spotifyGet(`https://api.spotify.com/v1/tracks/${trackId}`, token);

        if (track) {
          return {
            title: track.name,
            artist: track.artists?.[0]?.name,
            album: track.album?.name,
            isrc: track.external_ids?.isrc,
            duration_ms: track.duration_ms,
            cover_image_url: track.album?.images?.[0]?.url,
            platform_links: {
              spotify: track.external_urls?.spotify,
            },
            confidence: 0.9, // High confidence for direct Spotify fetch
            resolver_sources: ["spotify_direct"],
            needs_manual_review: false,
          };
        }
      } catch (err: any) {
        console.warn("[SmartLinkResolver] Spotify direct fetch failed:", err.message);
      }
    }
  }

  // Try Spotify search by title + artist
  if (input.hint_title && input.hint_artist) {
    try {
      const token = await getSpotifyAccessToken();
      const query = `${input.hint_artist} ${input.hint_title}`;
      const searchResult = await spotifyGet(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
        token
      );

      const track = searchResult?.tracks?.items?.[0];
      if (track) {
        return {
          title: track.name,
          artist: track.artists?.[0]?.name,
          album: track.album?.name,
          isrc: track.external_ids?.isrc,
          duration_ms: track.duration_ms,
          cover_image_url: track.album?.images?.[0]?.url,
          platform_links: {
            spotify: track.external_urls?.spotify,
          },
          confidence: 0.7, // Lower confidence for search
          resolver_sources: ["spotify_search"],
          needs_manual_review: false,
        };
      }
    } catch (err: any) {
      console.warn("[SmartLinkResolver] Spotify search failed:", err.message);
    }
  }

  return null;
}

/**
 * Validate ACRCloud result against user hints using string similarity
 */
function validateWithHints(result: Partial<ResolverResult>, input: ResolverInput): number {
  if (!input.hint_title && !input.hint_artist) {
    return 1.0; // No hints to compare against
  }

  let titleSim = 1.0;
  let artistSim = 1.0;

  if (input.hint_title && result.title) {
    titleSim = stringSimilarity(normalize(input.hint_title), normalize(result.title));
  }

  if (input.hint_artist && result.artist) {
    artistSim = stringSimilarity(normalize(input.hint_artist), normalize(result.artist));
  }

  // Weighted average (title more important)
  return titleSim * 0.6 + artistSim * 0.4;
}

/**
 * Normalize string for comparison (lowercase, remove punctuation, trim)
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/\(feat\.|featuring|ft\.|ft\)/gi, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * String similarity (Levenshtein-based)
 */
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
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

/**
 * Merge ACRCloud and fallback results
 */
function mergeResults(acr: Partial<ResolverResult>, fallback: Partial<ResolverResult>): Partial<ResolverResult> {
  return {
    title: acr.title || fallback.title,
    artist: acr.artist || fallback.artist,
    album: acr.album || fallback.album,
    isrc: acr.isrc || fallback.isrc,
    duration_ms: acr.duration_ms || fallback.duration_ms,
    cover_image_url: acr.cover_image_url || fallback.cover_image_url,
    platform_links: {
      ...fallback.platform_links,
      ...acr.platform_links, // ACRCloud takes precedence
    },
    acrcloud: acr.acrcloud,
    confidence: Math.max(acr.confidence || 0, fallback.confidence || 0),
    resolver_sources: [
      ...(acr.resolver_sources || []),
      ...(fallback.resolver_sources || []),
    ],
    needs_manual_review: (acr.confidence || 0) < CONF_OK && (fallback.confidence || 0) < CONF_OK,
  };
}

/**
 * Finalize resolution: select canonical URL, cache result, update smart_link
 */
async function finalizeResolution(
  supabase: any,
  result: Partial<ResolverResult>,
  path: string,
  input: ResolverInput
): Promise<ResolverResult> {
  // Select canonical URL
  const canonicalPlatform = determineCanonicalPlatform(result.platform_links || {});
  const canonicalUrl = result.platform_links?.[canonicalPlatform as keyof typeof result.platform_links];

  // Cache result in track_resolutions
  let trackResolutionId: string | undefined;

  const cachePayload = {
    isrc: result.isrc || null,
    title: result.title || null,
    artist: result.artist || null,
    album: result.album || null,
    duration_ms: result.duration_ms || null,
    spotify_track_id: extractSpotifyTrackId(result.platform_links?.spotify),
    spotify_url: result.platform_links?.spotify || null,
    apple_music_id: extractAppleMusicId(result.platform_links?.apple_music),
    apple_music_url: result.platform_links?.apple_music || null,
    youtube_url: result.platform_links?.youtube || null,
    deezer_url: result.platform_links?.deezer || null,
    acrid: result.acrcloud?.acrid || null,
    acrcloud_raw: result.acrcloud?.raw || null,
    resolver_sources: result.resolver_sources || [],
    confidence: result.confidence || 0,
    status: (result.confidence || 0) >= CONF_OK ? "resolved" : "needs_review",
  };

  // Try to upsert (update if exists, insert if not)
  if (result.acrcloud?.acrid || result.isrc) {
    const { data: existing } = await supabase
      .from("track_resolutions")
      .select("id")
      .or(
        result.acrcloud?.acrid
          ? `acrid.eq.${result.acrcloud.acrid}`
          : `isrc.eq.${result.isrc}`
      )
      .maybeSingle();

    if (existing) {
      // Update existing
      const { data: updated, error } = await supabase
        .from("track_resolutions")
        .update(cachePayload)
        .eq("id", existing.id)
        .select("id")
        .single();

      if (!error && updated) {
        trackResolutionId = updated.id;
      }
    } else {
      // Insert new
      const { data: inserted, error } = await supabase
        .from("track_resolutions")
        .insert(cachePayload)
        .select("id")
        .single();

      if (!error && inserted) {
        trackResolutionId = inserted.id;
      }
    }
  }

  // Update smart_link if ID provided
  if (input.smart_link_id && trackResolutionId) {
    await supabase
      .from("smart_links")
      .update({
        track_resolution_id: trackResolutionId,
        resolved_isrc: result.isrc || null,
        resolver_confidence: result.confidence,
        resolver_sources: result.resolver_sources,
      })
      .eq("id", input.smart_link_id);
  }

  return {
    success: true,
    resolver_path: path as any,
    title: result.title,
    artist: result.artist,
    album: result.album,
    isrc: result.isrc,
    duration_ms: result.duration_ms,
    cover_image_url: result.cover_image_url,
    canonical_url: canonicalUrl,
    canonical_platform: canonicalPlatform,
    platform_links: result.platform_links || {},
    acrcloud: result.acrcloud,
    confidence: result.confidence || 0,
    resolver_sources: result.resolver_sources || [],
    track_resolution_id: trackResolutionId,
    needs_manual_review: result.needs_manual_review || false,
  };
}

/**
 * Determine canonical platform based on priority
 */
function determineCanonicalPlatform(links: Record<string, string | undefined>): string {
  for (const platform of PLATFORM_PRIORITY) {
    if (links[platform]) {
      return platform;
    }
  }
  return "spotify"; // Default fallback
}

/**
 * Extract Spotify track ID from URL
 */
function extractSpotifyTrackId(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return match?.[1] || null;
}

/**
 * Extract Apple Music ID from URL
 */
function extractAppleMusicId(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/music\.apple\.com\/.*\/album\/.*\/(\d+)/);
  return match?.[1] || null;
}
