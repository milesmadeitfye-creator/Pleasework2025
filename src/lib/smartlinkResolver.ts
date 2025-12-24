/**
 * Smart Link Resolver Client
 * Frontend wrapper for smartlink-resolve endpoint (ACRCloud-first)
 */

export type ResolveSmartLinkInput = {
  spotify?: string; // Spotify URL/URI/ID
  isrc?: string; // ISRC code
  track?: string; // Track title
  artist?: string; // Artist name
};

export type ResolveSmartLinkResult = {
  ok: boolean;
  links: {
    spotify?: string;
    apple_music?: string;
    youtube?: string;
    youtube_music?: string;
    deezer?: string;
    tidal?: string;
    amazon_music?: string;
    soundcloud?: string;
  };
  isrc?: string;
  title?: string;
  artists?: string[];
  albumArt?: string;
  debug: {
    steps: string[];
    acr: {
      status: number;
      usedMode: string | null;
      platformBatches: string[];
      hadExternalMetadata: boolean;
    };
    audd?: {
      used: boolean;
      linkCount: number;
    };
  };
  error?: string;
};

/**
 * Resolve a smart link using ACRCloud-first pipeline
 */
export async function resolveSmartLink(
  input: ResolveSmartLinkInput
): Promise<ResolveSmartLinkResult> {
  try {
    const response = await fetch("/.netlify/functions/smartlink-resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        ok: false,
        links: {},
        debug: {
          steps: ["Request failed"],
          acr: {
            status: response.status,
            usedMode: null,
            platformBatches: [],
            hadExternalMetadata: false,
          },
        },
        error: errorData.error || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return data;
  } catch (err: any) {
    console.error("[resolveSmartLink] Error:", err);
    return {
      ok: false,
      links: {},
      debug: {
        steps: ["Network error"],
        acr: {
          status: 0,
          usedMode: null,
          platformBatches: [],
          hadExternalMetadata: false,
        },
      },
      error: err?.message || "Failed to resolve smart link",
    };
  }
}

/**
 * Get a human-readable label for ACR mode
 */
export function getAcrModeLabel(mode: string | null): string {
  switch (mode) {
    case "isrc":
      return "ISRC Lookup";
    case "source_url":
      return "Spotify URL Lookup";
    case "query":
      return "Track Search";
    default:
      return "Unknown";
  }
}

/**
 * Get debug summary string
 */
export function getDebugSummary(result: ResolveSmartLinkResult): string {
  const lines: string[] = [];

  lines.push(`ACRCloud Mode: ${getAcrModeLabel(result.debug.acr.usedMode)}`);
  lines.push(`ACRCloud Status: ${result.debug.acr.status}`);
  lines.push(`Had External Metadata: ${result.debug.acr.hadExternalMetadata ? "✓" : "✗"}`);

  if (result.debug.audd) {
    lines.push(`AudD Fallback: ${result.debug.audd.used ? "✓" : "✗"}`);
    if (result.debug.audd.used) {
      lines.push(`AudD Links: ${result.debug.audd.linkCount}`);
    }
  }

  const linkCount = Object.values(result.links).filter(Boolean).length;
  lines.push(`Total Platforms: ${linkCount}`);

  return lines.join("\n");
}
