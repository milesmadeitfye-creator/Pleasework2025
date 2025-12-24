/**
 * Resolve Smart Link Track
 * File: netlify/functions/resolve-smart-link-track.ts
 *
 * Orchestrates multi-source track resolution and saves to database
 * Links resolution to smart_links table
 */
import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { resolveTrack, type ResolveInput } from "./_lib/trackResolver";

const RESPONSE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { smart_link_id, force_refresh } = body;

    if (!smart_link_id) {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ success: false, error: "smart_link_id required" }),
      };
    }

    // Get auth token
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ success: false, error: "Unauthorized" }),
      };
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ success: false, error: "Invalid token" }),
      };
    }

    // Load smart link
    const { data: smartLink, error: linkError } = await supabase
      .from("smart_links")
      .select("*")
      .eq("id", smart_link_id)
      .eq("user_id", user.id)
      .single();

    if (linkError || !smartLink) {
      return {
        statusCode: 404,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ success: false, error: "Smart link not found" }),
      };
    }

    // Check if already resolved and high confidence
    if (
      !force_refresh &&
      smartLink.track_resolution_id &&
      smartLink.resolver_confidence &&
      smartLink.resolver_confidence >= 0.75
    ) {
      console.log("[ResolveTrack] Using existing high-confidence resolution");

      const { data: existingResolution } = await supabase
        .from("track_resolutions")
        .select("*")
        .eq("id", smartLink.track_resolution_id)
        .single();

      if (existingResolution) {
        return {
          statusCode: 200,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({
            success: true,
            resolution: existingResolution,
            cached: true,
          }),
        };
      }
    }

    // Build resolve input from smart link data
    const resolveInput: ResolveInput = {
      spotify_url: smartLink.spotify_url || undefined,
      apple_music_url: smartLink.apple_music_url || undefined,
      title: smartLink.title || undefined,
      artist: smartLink.artist || undefined,
    };

    // If we have platform-specific data, use it
    if (smartLink.config?.spotify_track_id) {
      resolveInput.spotify_track_id = smartLink.config.spotify_track_id;
    }
    if (smartLink.config?.apple_music_id) {
      resolveInput.apple_music_id = smartLink.config.apple_music_id;
    }
    if (smartLink.config?.isrc) {
      resolveInput.isrc = smartLink.config.isrc;
    }

    console.log("[ResolveTrack] Resolving track for smart link:", smart_link_id);

    // Run multi-source resolution
    const resolution = await resolveTrack(resolveInput);

    // Upsert into track_resolutions
    let trackResolutionId: string;

    // Check if we can match an existing resolution
    let existingResolutionQuery = supabase.from("track_resolutions").select("id");

    if (resolution.isrc) {
      existingResolutionQuery = existingResolutionQuery.eq("isrc", resolution.isrc);
    } else if (resolution.spotify_track_id) {
      existingResolutionQuery = existingResolutionQuery.eq("spotify_track_id", resolution.spotify_track_id);
    } else {
      existingResolutionQuery = null;
    }

    const existingResolution = existingResolutionQuery
      ? await existingResolutionQuery.maybeSingle()
      : { data: null };

    if (existingResolution.data) {
      // Update existing resolution
      trackResolutionId = existingResolution.data.id;

      await supabase
        .from("track_resolutions")
        .update({
          isrc: resolution.isrc || null,
          title: resolution.title || null,
          artist: resolution.artist || null,
          album: resolution.album || null,
          duration_ms: resolution.duration_ms || null,
          spotify_track_id: resolution.spotify_track_id || null,
          spotify_url: resolution.spotify_url || null,
          apple_music_id: resolution.apple_music_id || null,
          apple_music_url: resolution.apple_music_url || null,
          youtube_url: resolution.youtube_url || null,
          deezer_url: resolution.deezer_url || null,
          acrid: resolution.acrid || null,
          acrcloud_raw: resolution.acrcloud_raw || null,
          resolver_sources: resolution.resolver_sources,
          confidence: resolution.confidence,
          status: resolution.status,
          resolver_path: resolution.resolver_path || null,
          fallback_reason: resolution.fallback_reason || null,
        })
        .eq("id", trackResolutionId);

      console.log("[ResolveTrack] Updated existing resolution:", trackResolutionId);
    } else {
      // Create new resolution
      const { data: newResolution, error: resolutionError } = await supabase
        .from("track_resolutions")
        .insert([
          {
            isrc: resolution.isrc || null,
            title: resolution.title || null,
            artist: resolution.artist || null,
            album: resolution.album || null,
            duration_ms: resolution.duration_ms || null,
            spotify_track_id: resolution.spotify_track_id || null,
            spotify_url: resolution.spotify_url || null,
            apple_music_id: resolution.apple_music_id || null,
            apple_music_url: resolution.apple_music_url || null,
            youtube_url: resolution.youtube_url || null,
            deezer_url: resolution.deezer_url || null,
            acrid: resolution.acrid || null,
            acrcloud_raw: resolution.acrcloud_raw || null,
            resolver_sources: resolution.resolver_sources,
            confidence: resolution.confidence,
            status: resolution.status,
            resolver_path: resolution.resolver_path || null,
            fallback_reason: resolution.fallback_reason || null,
          },
        ])
        .select()
        .single();

      if (resolutionError || !newResolution) {
        throw new Error("Failed to create track resolution");
      }

      trackResolutionId = newResolution.id;
      console.log("[ResolveTrack] Created new resolution:", trackResolutionId);
    }

    // Update smart_links with resolution
    await supabase
      .from("smart_links")
      .update({
        track_resolution_id: trackResolutionId,
        resolved_isrc: resolution.isrc || null,
        resolver_confidence: resolution.confidence,
        resolver_sources: resolution.resolver_sources,
      })
      .eq("id", smart_link_id);

    console.log("[ResolveTrack] Linked resolution to smart link");

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        success: true,
        resolution: {
          ...resolution,
          id: trackResolutionId,
        },
        cached: false,
      }),
    };
  } catch (err: any) {
    console.error("[ResolveTrack] Error:", err);

    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        success: false,
        error: "Track resolution failed",
        message: err.message || String(err),
      }),
    };
  }
};
