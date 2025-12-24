/**
 * ACRCloud External Metadata Client
 * Uses ACRCloud External Metadata API with Bearer token auth
 * to fetch platform links (Spotify, Apple Music, YouTube, Deezer, etc.)
 */

import { requireSecret } from "./_shared/secrets";

type AcrQueryMode = "isrc" | "source_url" | "query";

type AcrExternalMetadataParams = {
  isrc?: string;
  source_url?: string;
  query?: string;
  format?: "json";
  platforms?: string;
};

type AcrExternalMetadataResult = {
  ok: boolean;
  data?: any;
  linksByPlatform?: Record<string, { url: string; id?: string }[]>;
  debug: {
    usedMode: AcrQueryMode | null;
    requested: any;
    status: number;
    hadExternalMetadata: boolean;
    platformBatches?: string[];
    error?: string;
  };
};

/**
 * Call ACRCloud External Metadata API
 * Priority: isrc > source_url > query
 */
export async function acrExternalMetadata(
  params: AcrExternalMetadataParams
): Promise<AcrExternalMetadataResult> {
  let baseUrl: string;
  let bearerToken: string;

  try {
    baseUrl = await requireSecret("ACRCLOUD_BASE_URL");
  } catch {
    baseUrl = "https://eu-api-v2.acrcloud.com";
  }

  try {
    bearerToken = await requireSecret("ACRCLOUD_BEARER_TOKEN");
  } catch (err: any) {
    console.error("[_acrcloud] Missing ACRCLOUD_BEARER_TOKEN");
    return {
      ok: false,
      debug: {
        usedMode: null,
        requested: params,
        status: 0,
        hadExternalMetadata: false,
        error: "ACRCLOUD_BEARER_TOKEN not configured",
      },
    };
  }

  // Determine query mode (priority: isrc > source_url > query)
  let usedMode: AcrQueryMode | null = null;
  const queryParams = new URLSearchParams();

  if (params.isrc) {
    usedMode = "isrc";
    queryParams.set("isrc", params.isrc);
  } else if (params.source_url) {
    usedMode = "source_url";
    queryParams.set("source_url", params.source_url);
  } else if (params.query) {
    usedMode = "query";
    queryParams.set("query", params.query);
    if (params.format === "json") {
      queryParams.set("format", "json");
    }
  } else {
    return {
      ok: false,
      debug: {
        usedMode: null,
        requested: params,
        status: 0,
        hadExternalMetadata: false,
        error: "No valid query parameter provided (need isrc, source_url, or query)",
      },
    };
  }

  // ✅ ACR LIMIT: Max 5 platforms per request
  // Priority order: Spotify, Apple Music, YouTube, Amazon Music, Tidal
  const defaultPlatforms = "spotify,applemusic,youtube,amazonmusic,tidal";
  queryParams.set("platforms", params.platforms || defaultPlatforms);

  const url = `${baseUrl}/api/external-metadata/tracks?${queryParams.toString()}`;

  console.log("[_acrcloud] Calling External Metadata API:", {
    mode: usedMode,
    platforms: params.platforms || batch1,
    hasIsrc: !!params.isrc,
    hasSourceUrl: !!params.source_url,
    hasQuery: !!params.query,
  });

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: "application/json",
      },
    });

    const status = response.status;
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("[_acrcloud] API error:", status, data);
      return {
        ok: false,
        data,
        debug: {
          usedMode,
          requested: params,
          status,
          hadExternalMetadata: false,
          platformBatches: [params.platforms || batch1],
          error: `ACRCloud API returned ${status}`,
        },
      };
    }

    // Check if we got external_metadata
    const hasResults = data.data && Array.isArray(data.data) && data.data.length > 0;
    const firstResult = hasResults ? data.data[0] : null;
    const hadExternalMetadata = !!(firstResult?.external_metadata);

    console.log("[_acrcloud] Success:", {
      status,
      resultCount: data.data?.length || 0,
      hadExternalMetadata,
      platforms: firstResult?.external_metadata
        ? Object.keys(firstResult.external_metadata)
        : [],
    });

    // Build linksByPlatform map
    const linksByPlatform: Record<string, { url: string; id?: string }[]> = {};

    if (firstResult?.external_metadata) {
      for (const [platform, items] of Object.entries(firstResult.external_metadata)) {
        if (Array.isArray(items)) {
          linksByPlatform[platform] = items.map((item: any) => ({
            url: item.link || item.url || "",
            id: item.id || item.track?.id || "",
          }));
        }
      }
    }

    return {
      ok: true,
      data,
      linksByPlatform,
      debug: {
        usedMode,
        requested: params,
        status,
        hadExternalMetadata,
        platformBatches: [params.platforms || batch1],
      },
    };
  } catch (err: any) {
    console.error("[_acrcloud] Request failed:", err.message);
    return {
      ok: false,
      debug: {
        usedMode,
        requested: params,
        status: 0,
        hadExternalMetadata: false,
        platformBatches: [params.platforms || batch1],
        error: err.message || "Network error",
      },
    };
  }
}

/**
 * Extract ISRC from ACRCloud response
 */
export function extractIsrcFromAcr(data: any): string | null {
  if (!data?.data?.[0]) return null;
  const track = data.data[0];
  return track.external_ids?.isrc || track.isrc || null;
}

/**
 * Extract track metadata from ACRCloud response
 */
export function extractMetadataFromAcr(data: any): {
  title: string | null;
  artist: string | null;
  album: string | null;
  isrc: string | null;
} {
  if (!data?.data?.[0]) {
    return { title: null, artist: null, album: null, isrc: null };
  }

  const track = data.data[0];

  return {
    title: track.name || track.title || null,
    artist: track.artists?.[0]?.name || null,
    album: track.album?.name || null,
    isrc: track.external_ids?.isrc || track.isrc || null,
  };
}
