/**
 * Pre-Save Auto-Save Job
 *
 * Scheduled job that runs periodically to check for presave campaigns
 * whose release date has passed and automatically saves tracks to
 * fans' Spotify libraries using their stored OAuth tokens.
 *
 * Scheduled via: Netlify scheduled function or external cron
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Refresh Spotify access token using refresh token
 */
async function refreshSpotifyToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
} | null> {
  try {
    const tokenBody = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
      client_secret: SPOTIFY_CLIENT_SECRET,
    });

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[presave-auto-save] Token refresh failed:", response.status, error);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (err: any) {
    console.error("[presave-auto-save] Token refresh error:", err.message);
    return null;
  }
}

/**
 * Save track to user's Spotify library
 */
async function saveTrackToLibrary(accessToken: string, trackId: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[presave-auto-save] Save track failed:", response.status, error);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error("[presave-auto-save] Save track error:", err.message);
    return false;
  }
}

export const handler: Handler = async (event) => {
  console.log("[presave-auto-save] Starting auto-save job");

  try {
    // Find presave links with release date passed and resolved Spotify track
    const { data: presaveLinks, error: fetchError } = await supabase
      .from("smart_links")
      .select("id, slug, title, config, spotify_track_id, spotify_uri")
      .eq("link_type", "presave")
      .eq("resolution_status", "resolved")
      .not("spotify_track_id", "is", null)
      .lte("config->releaseDateIso", new Date().toISOString());

    if (fetchError) {
      console.error("[presave-auto-save] Failed to fetch presave links:", fetchError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to fetch presave links" }),
      };
    }

    if (!presaveLinks || presaveLinks.length === 0) {
      console.log("[presave-auto-save] No presave links with release date passed");
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No presave links to process", processed: 0 }),
      };
    }

    console.log("[presave-auto-save] Found", presaveLinks.length, "presave links to process");

    let totalSignups = 0;
    let successfulSaves = 0;
    let failedSaves = 0;

    // Process each presave link
    for (const presaveLink of presaveLinks) {
      console.log("[presave-auto-save] Processing:", presaveLink.slug || presaveLink.id);

      if (!presaveLink.spotify_track_id) {
        console.warn("[presave-auto-save] Skipping - no Spotify track ID");
        continue;
      }

      // Find all signups for this presave that haven't been saved yet
      const { data: signups, error: signupsError } = await supabase
        .from("presave_signups")
        .select("*")
        .eq("presave_id", presaveLink.id)
        .eq("saved_successfully", false)
        .is("saved_at", null);

      if (signupsError) {
        console.error("[presave-auto-save] Failed to fetch signups:", signupsError);
        continue;
      }

      if (!signups || signups.length === 0) {
        console.log("[presave-auto-save] No pending signups for", presaveLink.slug);
        continue;
      }

      console.log("[presave-auto-save] Found", signups.length, "signups to save");
      totalSignups += signups.length;

      // ALSO: Check for Forever Save fans for this owner
      // Get owner_id from presave link
      const { data: linkOwner } = await supabase
        .from("smart_links")
        .select("user_id")
        .eq("id", presaveLink.id)
        .maybeSingle();

      if (linkOwner && linkOwner.user_id) {
        // Find forever_save connections for this owner
        const { data: foreverConnections } = await supabase
          .from("fan_music_connections")
          .select("*")
          .eq("owner_user_id", linkOwner.user_id)
          .eq("forever_save", true)
          .not("spotify_user_id", "is", null);

        if (foreverConnections && foreverConnections.length > 0) {
          console.log("[presave-auto-save] Found", foreverConnections.length, "forever-save fans for this artist");

          // Create presave_signups entries for forever-save fans if they don't exist
          for (const connection of foreverConnections) {
            // Check if already has signup for this presave
            const { data: existingSignup } = await supabase
              .from("presave_signups")
              .select("id")
              .eq("presave_id", presaveLink.id)
              .eq("spotify_user_id", connection.spotify_user_id)
              .maybeSingle();

            if (!existingSignup) {
              // Create signup from forever-save connection
              await supabase
                .from("presave_signups")
                .insert({
                  presave_id: presaveLink.id,
                  spotify_user_id: connection.spotify_user_id,
                  spotify_access_token: connection.spotify_access_token,
                  spotify_refresh_token: connection.spotify_refresh_token,
                  token_expires_at: connection.spotify_token_expires_at,
                  has_consented: true,
                  forever_save: true,
                  fan_email: connection.fan_email,
                  metadata: {
                    auto_enrolled_via_forever_save: true,
                    enrolled_at: new Date().toISOString(),
                  },
                });
              console.log("[presave-auto-save] Auto-enrolled forever-save fan:", connection.fan_email);
            }
          }

          // Re-fetch signups to include forever-save fans
          const { data: updatedSignups } = await supabase
            .from("presave_signups")
            .select("*")
            .eq("presave_id", presaveLink.id)
            .eq("saved_successfully", false)
            .is("saved_at", null);

          if (updatedSignups) {
            signups.push(...updatedSignups.filter(s => !signups.find(existing => existing.id === s.id)));
          }
        }
      }

      // Process each signup
      for (const signup of signups) {
        try {
          let accessToken = signup.spotify_access_token;
          const tokenExpiry = new Date(signup.token_expires_at || 0);
          const now = new Date();

          // Refresh token if expired or about to expire (within 5 minutes)
          if (tokenExpiry < new Date(now.getTime() + 5 * 60 * 1000)) {
            console.log("[presave-auto-save] Token expired, refreshing for user:", signup.spotify_user_id);

            if (!signup.spotify_refresh_token) {
              console.error("[presave-auto-save] No refresh token available");
              await supabase
                .from("presave_signups")
                .update({
                  error_message: "No refresh token available",
                })
                .eq("id", signup.id);
              failedSaves++;
              continue;
            }

            const refreshResult = await refreshSpotifyToken(signup.spotify_refresh_token);

            if (!refreshResult) {
              console.error("[presave-auto-save] Token refresh failed");
              await supabase
                .from("presave_signups")
                .update({
                  error_message: "Token refresh failed",
                })
                .eq("id", signup.id);
              failedSaves++;
              continue;
            }

            accessToken = refreshResult.access_token;

            // Update tokens in database
            const newExpiry = new Date(Date.now() + refreshResult.expires_in * 1000);
            await supabase
              .from("presave_signups")
              .update({
                spotify_access_token: refreshResult.access_token,
                spotify_refresh_token: refreshResult.refresh_token || signup.spotify_refresh_token,
                token_expires_at: newExpiry.toISOString(),
              })
              .eq("id", signup.id);
          }

          // Save track to library
          console.log("[presave-auto-save] Saving track for user:", signup.spotify_user_id);
          const saved = await saveTrackToLibrary(accessToken, presaveLink.spotify_track_id);

          if (saved) {
            // Mark as saved
            await supabase
              .from("presave_signups")
              .update({
                saved_successfully: true,
                saved_at: new Date().toISOString(),
                error_message: null,
              })
              .eq("id", signup.id);

            console.log("[presave-auto-save] Successfully saved for:", signup.spotify_user_id);
            successfulSaves++;
          } else {
            // Mark as failed
            await supabase
              .from("presave_signups")
              .update({
                error_message: "Failed to save track to library",
              })
              .eq("id", signup.id);

            console.error("[presave-auto-save] Failed to save for:", signup.spotify_user_id);
            failedSaves++;
          }
        } catch (err: any) {
          console.error("[presave-auto-save] Error processing signup:", err.message);

          await supabase
            .from("presave_signups")
            .update({
              error_message: err.message || "Unknown error",
            })
            .eq("id", signup.id);

          failedSaves++;
        }
      }
    }

    console.log("[presave-auto-save] Job complete:", {
      totalSignups,
      successfulSaves,
      failedSaves,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Auto-save job complete",
        totalSignups,
        successfulSaves,
        failedSaves,
      }),
    };
  } catch (err: any) {
    console.error("[presave-auto-save] Job error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Internal server error" }),
    };
  }
};
