/**
 * Pre-Save Spotify Track Resolver
 *
 * Resolves Spotify track ID/URI for pre-save campaigns using:
 * 1. Direct Spotify URL parsing (if provided)
 * 2. ACRCloud External Metadata (if source URL or ISRC available)
 * 3. Spotify Search API (using ISRC or title+artist)
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { acrExternalMetadata, extractIsrcFromAcr, extractMetadataFromAcr } from "./_acrcloud";
import { getSpotifyAccessToken, spotifyGet } from "./_lib/spotifyClient";

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { presave_id, slug, spotify_url, title, artist } = JSON.parse(event.body || "{}");

    if (!presave_id && !slug) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "presave_id or slug required" }),
      };
    }

    // Fetch the presave link
    let query = supabase.from("smart_links").select("*").eq("link_type", "presave");

    if (presave_id) {
      query = query.eq("id", presave_id);
    } else {
      query = query.eq("slug", slug);
    }

    const { data: presaveLink, error: fetchError } = await query.maybeSingle();

    if (fetchError || !presaveLink) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Pre-save link not found" }),
      };
    }

    // Already resolved?
    if (presaveLink.spotify_track_id && presaveLink.resolution_status === "resolved") {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          already_resolved: true,
          spotify_track_id: presaveLink.spotify_track_id,
          spotify_uri: presaveLink.spotify_uri,
          isrc: presaveLink.isrc,
          confidence: presaveLink.resolution_confidence,
        }),
      };
    }

    const config = presaveLink.config || {};
    const releaseTitle = title || config.releaseTitle || presaveLink.title;
    const artistName = artist || config.artist || "";

    console.log("[presave-resolve-spotify] Resolving:", {
      presave_id: presaveLink.id,
      slug: presaveLink.slug,
      releaseTitle,
      artistName,
      has_spotify_url: !!spotify_url,
    });

    let resolvedSpotifyId: string | null = null;
    let resolvedSpotifyUri: string | null = null;
    let resolvedIsrc: string | null = null;
    let confidence = 0;
    let method = "";

    // STRATEGY A: Parse Spotify URL directly
    if (spotify_url) {
      const spotifyMatch = spotify_url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
      if (spotifyMatch) {
        resolvedSpotifyId = spotifyMatch[1];
        resolvedSpotifyUri = `spotify:track:${resolvedSpotifyId}`;
        confidence = 100;
        method = "direct_url";
        console.log("[presave-resolve-spotify] Resolved via direct URL");
      }
    }

    // STRATEGY B: Use ACRCloud External Metadata
    if (!resolvedSpotifyId && (spotify_url || releaseTitle)) {
      console.log("[presave-resolve-spotify] Trying ACRCloud...");

      const acrResult = await acrExternalMetadata({
        source_url: spotify_url || undefined,
        query: !spotify_url && releaseTitle ? `${releaseTitle} ${artistName}`.trim() : undefined,
        platforms: "spotify",
      });

      if (acrResult.ok && acrResult.linksByPlatform?.spotify?.[0]) {
        const spotifyLink = acrResult.linksByPlatform.spotify[0];
        const spotifyMatch = spotifyLink.url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);

        if (spotifyMatch) {
          resolvedSpotifyId = spotifyMatch[1];
          resolvedSpotifyUri = `spotify:track:${resolvedSpotifyId}`;
          confidence = 85;
          method = "acrcloud";
          console.log("[presave-resolve-spotify] Resolved via ACRCloud");
        }

        // Extract ISRC if available
        if (acrResult.data) {
          resolvedIsrc = extractIsrcFromAcr(acrResult.data);
        }
      }
    }

    // STRATEGY C: Spotify Search API (using ISRC or title+artist)
    if (!resolvedSpotifyId) {
      console.log("[presave-resolve-spotify] Trying Spotify Search...");

      const spotifyToken = await getSpotifyAccessToken();

      // Try ISRC search first if we have one
      if (resolvedIsrc) {
        try {
          const searchUrl = `https://api.spotify.com/v1/search?q=isrc:${resolvedIsrc}&type=track&limit=1`;
          const searchResult = await spotifyGet(searchUrl, spotifyToken);

          if (searchResult.tracks?.items?.[0]) {
            const track = searchResult.tracks.items[0];
            resolvedSpotifyId = track.id;
            resolvedSpotifyUri = track.uri;
            confidence = 90;
            method = "spotify_search_isrc";
            console.log("[presave-resolve-spotify] Resolved via Spotify ISRC search");
          }
        } catch (err: any) {
          console.error("[presave-resolve-spotify] ISRC search failed:", err.message);
        }
      }

      // Fall back to title+artist search
      if (!resolvedSpotifyId && releaseTitle) {
        try {
          const searchQuery = `${releaseTitle} ${artistName}`.trim();
          const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=5`;
          const searchResult = await spotifyGet(searchUrl, spotifyToken);

          if (searchResult.tracks?.items?.length > 0) {
            // Try to find exact match
            const exactMatch = searchResult.tracks.items.find((track: any) => {
              const titleMatch = track.name.toLowerCase() === releaseTitle.toLowerCase();
              const artistMatch = artistName
                ? track.artists.some((a: any) => a.name.toLowerCase() === artistName.toLowerCase())
                : true;
              return titleMatch && artistMatch;
            });

            const track = exactMatch || searchResult.tracks.items[0];
            resolvedSpotifyId = track.id;
            resolvedSpotifyUri = track.uri;
            resolvedIsrc = track.external_ids?.isrc || resolvedIsrc;
            confidence = exactMatch ? 75 : 50;
            method = exactMatch ? "spotify_search_exact" : "spotify_search_best";
            console.log("[presave-resolve-spotify] Resolved via Spotify title+artist search");
          }
        } catch (err: any) {
          console.error("[presave-resolve-spotify] Title+artist search failed:", err.message);
        }
      }
    }

    // Update database
    if (resolvedSpotifyId) {
      const { error: updateError } = await supabase
        .from("smart_links")
        .update({
          spotify_track_id: resolvedSpotifyId,
          spotify_uri: resolvedSpotifyUri,
          isrc: resolvedIsrc,
          resolution_status: "resolved",
          resolution_confidence: confidence,
        })
        .eq("id", presaveLink.id);

      if (updateError) {
        console.error("[presave-resolve-spotify] Failed to update:", updateError);
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          spotify_track_id: resolvedSpotifyId,
          spotify_uri: resolvedSpotifyUri,
          spotify_url: `https://open.spotify.com/track/${resolvedSpotifyId}`,
          isrc: resolvedIsrc,
          confidence,
          method,
        }),
      };
    }

    // Resolution failed
    await supabase
      .from("smart_links")
      .update({
        resolution_status: "failed",
        resolution_confidence: 0,
      })
      .eq("id", presaveLink.id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: false,
        error: "Could not resolve Spotify track",
        tried_methods: ["direct_url", "acrcloud", "spotify_search"],
      }),
    };
  } catch (err: any) {
    console.error("[presave-resolve-spotify] Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Internal server error" }),
    };
  }
};
