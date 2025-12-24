/**
 * Link Validation for Smart Link Resolver
 * Validates platform URLs before returning them to users
 */

type PlatformPatterns = {
  [platform: string]: RegExp[];
};

// Strict patterns for each platform (only accept direct track/video links)
const PLATFORM_PATTERNS: PlatformPatterns = {
  spotify: [
    /^https:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]{22}/,
  ],
  apple_music: [
    /^https:\/\/music\.apple\.com\/[a-z]{2}\/album\/[^/]+\/\d+\?i=\d+/,
    /^https:\/\/geo\.music\.apple\.com/,
  ],
  youtube: [
    /^https:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}/,
  ],
  youtube_music: [
    /^https:\/\/music\.youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}/,
  ],
  deezer: [
    /^https:\/\/(www\.)?deezer\.com\/[a-z]{2}\/track\/\d+/,
  ],
  tidal: [
    /^https:\/\/(listen\.)?tidal\.com\/browse\/track\/\d+/,
  ],
  amazon_music: [
    /^https:\/\/music\.amazon\.com/,
  ],
  soundcloud: [
    /^https:\/\/soundcloud\.com\/[^/]+\/[^/]+/,
  ],
  napster: [
    /^https:\/\/(www\.)?napster\.com/,
  ],
};

// Platforms that commonly block HEAD requests
const HEAD_BLOCKED_PLATFORMS = new Set([
  "spotify",
  "apple_music",
  "youtube",
  "youtube_music",
  "soundcloud",
]);

/**
 * Validate a URL against platform patterns
 */
export function validateLinkPattern(platform: string, url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  const patterns = PLATFORM_PATTERNS[platform];
  if (!patterns) {
    console.warn("[validateLinks] Unknown platform:", platform);
    return false;
  }

  return patterns.some((pattern) => pattern.test(url));
}

/**
 * Validate all platform links and return only valid ones
 */
export function validateAllLinks(links: Record<string, string | undefined>): Record<string, string> {
  const validated: Record<string, string> = {};

  for (const [platform, url] of Object.entries(links)) {
    if (!url) continue;

    if (validateLinkPattern(platform, url)) {
      validated[platform] = url;
    } else {
      console.warn("[validateLinks] Invalid URL for", platform, ":", url);
    }
  }

  return validated;
}

/**
 * Optional: Lightweight HEAD request validation (with timeout)
 * Only use for platforms that don't block HEAD requests
 */
export async function validateLinkWithHead(
  platform: string,
  url: string,
  timeoutMs = 3000
): Promise<boolean> {
  // Skip HEAD check for platforms that block it
  if (HEAD_BLOCKED_PLATFORMS.has(platform)) {
    return validateLinkPattern(platform, url);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    // Accept 2xx, 3xx, and some 4xx (like 405 for HEAD not allowed)
    return response.status < 500;
  } catch (err: any) {
    // On error, fall back to pattern validation
    console.warn("[validateLinks] HEAD request failed for", platform, ":", err.message);
    return validateLinkPattern(platform, url);
  }
}

/**
 * Batch validate all links with optional HEAD checks
 */
export async function validateAllLinksWithHead(
  links: Record<string, string | undefined>
): Promise<Record<string, string>> {
  const validated: Record<string, string> = {};

  // First pass: pattern validation (fast)
  const patternValidated = validateAllLinks(links);

  // Second pass: HEAD validation (slow, optional)
  const headPromises = Object.entries(patternValidated).map(async ([platform, url]) => {
    const isValid = await validateLinkWithHead(platform, url);
    return { platform, url, isValid };
  });

  const headResults = await Promise.allSettled(headPromises);

  for (const result of headResults) {
    if (result.status === "fulfilled" && result.value.isValid) {
      validated[result.value.platform] = result.value.url;
    }
  }

  return validated;
}
