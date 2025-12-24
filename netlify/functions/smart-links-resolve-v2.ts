/**
 * Smart Links Resolve V2
 * Uses ACRCloud-first resolver pipeline
 *
 * Endpoint: POST /.netlify/functions/smart-links-resolve-v2
 *
 * Request body:
 * {
 *   audio_url?: string;
 *   isrc?: string;
 *   acrid?: string;
 *   spotify_url?: string;
 *   hint_title?: string;
 *   hint_artist?: string;
 *   smart_link_id?: string;
 *   force_refresh?: boolean;
 * }
 *
 * Response:
 * {
 *   success: boolean;
 *   resolver_path: string;
 *   title: string;
 *   artist: string;
 *   canonical_url: string;
 *   platform_links: {...};
 *   confidence: number;
 *   needs_manual_review: boolean;
 * }
 */

import type { Handler } from "@netlify/functions";
import { resolveSmartLink, type ResolverInput } from "./_lib/smartlinkResolverPipeline";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};

    // Build resolver input from request
    const input: ResolverInput = {
      audio_url: body.audio_url || body.audioUrl || body.sourceUrl,
      audio_file_path: body.audio_file_path || body.audioFilePath,
      isrc: body.isrc,
      acrid: body.acrid,
      spotify_url: body.spotify_url || body.spotifyUrl,
      spotify_track_id: body.spotify_track_id || body.spotifyTrackId,
      hint_title: body.hint_title || body.hintTitle || body.title,
      hint_artist: body.hint_artist || body.hintArtist || body.artist,
      hint_album: body.hint_album || body.hintAlbum || body.album,
      smart_link_id: body.smart_link_id || body.smartLinkId,
      force_refresh: body.force_refresh || body.forceRefresh || false,
    };

    console.log("[smart-links-resolve-v2] Processing request:", {
      has_audio_url: !!input.audio_url,
      has_isrc: !!input.isrc,
      has_acrid: !!input.acrid,
      has_spotify_url: !!input.spotify_url,
      has_hints: !!(input.hint_title && input.hint_artist),
      smart_link_id: input.smart_link_id,
      force_refresh: input.force_refresh,
    });

    // Validate input
    const hasIdentifier =
      input.audio_url ||
      input.isrc ||
      input.acrid ||
      input.spotify_url ||
      (input.hint_title && input.hint_artist);

    if (!hasIdentifier) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: "Missing input. Provide at least one of: audio_url, isrc, acrid, spotify_url, or hint_title+hint_artist",
        }),
      };
    }

    // Run resolver pipeline
    const result = await resolveSmartLink(input);

    console.log("[smart-links-resolve-v2] Result:", {
      success: result.success,
      resolver_path: result.resolver_path,
      confidence: result.confidence,
      has_canonical_url: !!result.canonical_url,
      platform_links_count: Object.keys(result.platform_links).length,
    });

    // Return result
    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    console.error("[smart-links-resolve-v2] Fatal error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: "Internal server error",
        message: err?.message || "Unknown error",
      }),
    };
  }
};
