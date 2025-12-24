import type { CoreMeta, ResolveHit } from "./types";
import { auddAdapter } from "./adapters";
import { tidalFallback, soundcloudFallback } from "./fallbacks";
import { spotifyToCoreMeta, searchSpotify, extractSpotifyTrackId } from "./spotify";

/**
 * Hybrid Spotify + AUDD Resolver
 *
 * Strategy:
 * 1. If user provides Spotify URL → Use Spotify as canonical source
 * 2. If no Spotify URL → Search Spotify for the track
 * 3. Use Spotify's ISRC with AUDD to find other platforms
 * 4. Apply confidence filtering (>= 0.9)
 * 5. Return deduplicated results
 *
 * This ensures:
 * - Accurate track identity (Spotify is ground truth)
 * - Official metadata (title, artist, artwork, ISRC)
 * - Wide platform coverage (AUDD expands to Apple, YouTube, etc.)
 */
export async function resolveAll(
  metaOrUrl: CoreMeta | string,
  options?: { skipSpotify?: boolean }
): Promise<{ core: CoreMeta & { spotify_url?: string; cover_art_url?: string }; links: ResolveHit[] }> {
  let coreMeta: CoreMeta & { spotify_url?: string; cover_art_url?: string };
  let spotifyUrl: string | undefined;
  let skipSpotify = options?.skipSpotify || false;

  // Step 1: Get canonical metadata from Spotify
  if (typeof metaOrUrl === "string") {
    // URL provided - extract and fetch from Spotify
    const trackId = extractSpotifyTrackId(metaOrUrl);
    if (trackId) {
      try {
        const spotifyMeta = await spotifyToCoreMeta(trackId);
        coreMeta = spotifyMeta;
        spotifyUrl = spotifyMeta.spotify_url;
        skipSpotify = true; // We already have Spotify, don't search again
      } catch (err) {
        console.error("[Resolver] Spotify fetch failed:", err);
        // Fall back to text-based CoreMeta
        coreMeta = metaOrUrl as any;
      }
    } else {
      // Not a Spotify URL, treat as text query
      coreMeta = metaOrUrl as any;
    }
  } else {
    // CoreMeta provided
    coreMeta = metaOrUrl;

    // Try to enhance with Spotify if we don't have ISRC
    if (!coreMeta.isrc && !skipSpotify) {
      try {
        const spotifyMeta = await searchSpotify(coreMeta.title, coreMeta.artist);
        if (spotifyMeta) {
          coreMeta = { ...coreMeta, ...spotifyMeta };
          spotifyUrl = spotifyMeta.spotify_url;
          skipSpotify = true;
        }
      } catch (err) {
        console.error("[Resolver] Spotify search failed:", err);
      }
    }
  }

  // Step 2: Use AUDD to find track on other platforms
  const settled = await Promise.allSettled([
    auddAdapter(coreMeta, skipSpotify),
    tidalFallback(coreMeta),
    soundcloudFallback(coreMeta),
  ]);

  const hits = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));

  // Step 3: Add Spotify to results if we have it
  if (spotifyUrl && !hits.some((h) => h.platform === "spotify")) {
    hits.push({
      platform: "spotify",
      platform_id: extractSpotifyTrackId(spotifyUrl) || "",
      url_web: spotifyUrl,
      url_app: spotifyUrl,
      storefront: null,
      confidence: 1.0, // Spotify is canonical source
    });
  }

  // Step 4: Deduplicate and filter by confidence
  const byPlatform = new Map<string, ResolveHit>();
  for (const h of hits) {
    const prev = byPlatform.get(h.platform);
    if (!prev || h.confidence > prev.confidence) {
      byPlatform.set(h.platform, h);
    }
  }

  return {
    core: coreMeta,
    links: Array.from(byPlatform.values()).filter((h) => h.confidence >= 0.9),
  };
}
