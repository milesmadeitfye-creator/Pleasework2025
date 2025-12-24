/**
 * AudD Links Resolver
 * Uses AudD API to expand ISRC/Spotify URL to multi-platform deep links
 * NO SEARCH - only uses "links" method which returns direct URLs
 */

import { requireSecret } from "../_shared/secrets";

const AUDD_API_URL = "https://api.audd.io/";

export type AuddLinksResult = {
  spotify?: string;
  apple_music?: string;
  youtube?: string;
  youtube_music?: string;
  deezer?: string;
  tidal?: string;
  amazon_music?: string;
  soundcloud?: string;
  napster?: string;
};

/**
 * Call AudD Links API with ISRC or Spotify URL
 * Returns ONLY deep links (no search URLs)
 */
export async function fetchAuddLinks(params: {
  isrc?: string;
  spotify_url?: string;
}): Promise<AuddLinksResult> {
  if (!params.isrc && !params.spotify_url) {
    throw new Error("Either ISRC or Spotify URL is required");
  }

  let auddApiKey: string;
  try {
    auddApiKey = await requireSecret("AUDD_API_KEY");
  } catch (err) {
    console.error("[resolverAudd] Missing AUDD_API_KEY");
    throw new Error("AudD API key not configured");
  }

  const body = new URLSearchParams({
    api_token: auddApiKey,
    method: "links",
  });

  if (params.isrc) {
    body.set("isrc", params.isrc);
  } else if (params.spotify_url) {
    body.set("url", params.spotify_url);
  }

  console.log("[resolverAudd] Fetching links with:", {
    isrc: params.isrc || null,
    spotify_url: params.spotify_url || null,
  });

  const response = await fetch(AUDD_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`AudD API returned ${response.status}`);
  }

  const text = await response.text();
  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    console.error("[resolverAudd] Invalid JSON response:", text.slice(0, 300));
    throw new Error("AudD returned invalid JSON");
  }

  if (json.error) {
    console.error("[resolverAudd] API error:", json.error);
    throw new Error(json.error.error_message || "AudD API error");
  }

  if (!json.result || json.status !== "success") {
    console.log("[resolverAudd] No results found");
    return {};
  }

  const result = json.result;

  // Extract ONLY direct deep links (no search URLs)
  const links: AuddLinksResult = {};

  // Spotify
  if (result.spotify?.external_urls?.spotify) {
    links.spotify = result.spotify.external_urls.spotify;
  } else if (result.song_link?.includes("open.spotify.com/track/")) {
    links.spotify = result.song_link;
  }

  // Apple Music (only direct trackViewUrl)
  if (result.apple_music?.url) {
    links.apple_music = result.apple_music.url;
  } else if (result.apple_music?.trackViewUrl) {
    links.apple_music = result.apple_music.trackViewUrl;
  } else if (result.song_link?.includes("music.apple.com")) {
    links.apple_music = result.song_link;
  }

  // YouTube Music (direct watch URL only)
  if (result.youtube_music?.url && result.youtube_music.url.includes("music.youtube.com/watch?v=")) {
    links.youtube_music = result.youtube_music.url;
  }

  // YouTube (direct watch URL only)
  if (result.youtube?.url && result.youtube.url.includes("youtube.com/watch?v=")) {
    links.youtube = result.youtube.url;
  }

  // Deezer (direct track URL only)
  if (result.deezer?.link && result.deezer.link.includes("deezer.com/track/")) {
    links.deezer = result.deezer.link;
  } else if (result.deezer?.url && result.deezer.url.includes("deezer.com/track/")) {
    links.deezer = result.deezer.url;
  }

  // Tidal (direct track URL only)
  if (result.tidal?.url && result.tidal.url.includes("tidal.com/browse/track/")) {
    links.tidal = result.tidal.url;
  } else if (result.tidal?.link && result.tidal.link.includes("tidal.com/browse/track/")) {
    links.tidal = result.tidal.link;
  }

  // Amazon Music (direct track URL only)
  if (result.amazon_music?.url && result.amazon_music.url.includes("music.amazon.com")) {
    links.amazon_music = result.amazon_music.url;
  }

  // SoundCloud (only permalink_url, no search)
  if (result.soundcloud?.permalink_url) {
    links.soundcloud = result.soundcloud.permalink_url;
  }

  // Napster
  if (result.napster?.url) {
    links.napster = result.napster.url;
  }

  console.log("[resolverAudd] Extracted links:", {
    count: Object.keys(links).length,
    platforms: Object.keys(links),
  });

  return links;
}
