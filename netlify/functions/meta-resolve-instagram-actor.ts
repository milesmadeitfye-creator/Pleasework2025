import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Resolves Instagram business account ID from a connected Facebook Page
 *
 * This function:
 * 1. Checks if we already have the IG actor ID in meta_credentials
 * 2. If not, queries Meta Graph API to get it from the page
 * 3. Saves it to database for future use
 *
 * Usage:
 * POST /.netlify/functions/meta-resolve-instagram-actor
 * Body: { user_id: string, page_id: string }
 */
export const handler: Handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const user_id = body.user_id;
    const page_id = body.page_id;

    console.log("[meta-resolve-instagram-actor] Request:", { user_id, page_id });

    if (!user_id || !page_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: "Missing user_id or page_id"
        }),
      };
    }

    // Pull token + existing IG data from meta_credentials
    const { data: conn, error: connErr } = await supabase
      .from("meta_credentials")
      .select("page_access_token, instagram_actor_id, instagram_business_account_id, instagram_username")
      .eq("user_id", user_id)
      .maybeSingle();

    if (connErr) {
      console.error("[meta-resolve-instagram-actor] Database error:", connErr);
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: "Database error: " + connErr.message
        }),
      };
    }

    if (!conn?.page_access_token) {
      console.warn("[meta-resolve-instagram-actor] No page_access_token found");
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: "Meta connection missing page_access_token"
        }),
      };
    }

    // If we already have it, return it immediately
    if (conn.instagram_actor_id) {
      console.log("[meta-resolve-instagram-actor] ✅ Found cached IG actor ID:", conn.instagram_actor_id);
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          instagramActorId: conn.instagram_actor_id,
          instagramUsername: conn.instagram_username,
          cached: true
        }),
      };
    }

    const token = conn.page_access_token;

    console.log("[meta-resolve-instagram-actor] Querying Meta Graph API for page:", page_id);

    // Query Meta Graph API: Page -> instagram_business_account
    const url = `https://graph.facebook.com/v21.0/${page_id}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`;
    const resp = await fetch(url);
    const json = await resp.json();

    console.log("[meta-resolve-instagram-actor] Graph API response:", json);

    if (json.error) {
      console.error("[meta-resolve-instagram-actor] Graph API error:", json.error);
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: json.error.message || "Meta Graph API error",
          metaError: json.error
        }),
      };
    }

    const ig = json?.instagram_business_account;
    const instagramActorId = ig?.id || null;
    const instagramUsername = ig?.username || null;

    console.log("[meta-resolve-instagram-actor] Extracted IG data:", { instagramActorId, instagramUsername });

    // Save to database if we found it
    if (instagramActorId) {
      console.log("[meta-resolve-instagram-actor] Saving IG actor ID to database");

      const { error: updateError } = await supabase
        .from("meta_credentials")
        .update({
          instagram_actor_id: instagramActorId,
          instagram_business_account_id: instagramActorId,
          instagram_username: instagramUsername,
        })
        .eq("user_id", user_id);

      if (updateError) {
        console.error("[meta-resolve-instagram-actor] Failed to save:", updateError);
        // Don't fail the request - we still return the ID
      } else {
        console.log("[meta-resolve-instagram-actor] ✅ Saved to database");
      }
    } else {
      console.warn("[meta-resolve-instagram-actor] ⚠️ No Instagram account connected to this page");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        instagramActorId,
        instagramUsername,
        cached: false,
        raw: json,
      }),
    };
  } catch (e: any) {
    console.error("[meta-resolve-instagram-actor] Unexpected error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: e?.message || "Unknown error"
      }),
    };
  }
};
