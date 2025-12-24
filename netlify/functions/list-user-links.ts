/**
 * Ghoste AI Tool: List all smart links for the authenticated user
 * Called by ghoste-ai.ts when user asks "show my smart links"
 *
 * IMPORTANT: Uses the SAME query as LinksPage.tsx to ensure consistency
 * Table: 'links' (not 'smart_links')
 * Filter: owner_id = userId AND type = 'smart'
 */
import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// Safe defaults - will be validated when used
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase configuration missing");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function getUserIdFromRequest(
  supabaseAdmin: ReturnType<typeof createClient>,
  headers: Record<string, string | undefined>
): Promise<string | null> {
  const authHeader = headers.authorization || headers.Authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "").trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
    };
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const headers = event.headers || {};
    const userId = await getUserIdFromRequest(supabaseAdmin, headers);

    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, error: "Unauthorized" }),
      };
    }

    console.log("[list-user-links] Fetching smart links for user:", userId.substring(0, 8));

    // IMPORTANT: Use 'smart_links' table (public /s/:slug route uses this)
    const { data: links, error: linksError } = await supabaseAdmin
      .from("smart_links")
      .select("id, slug, title, cover_image_url, spotify_url, apple_music_url, youtube_url, tidal_url, soundcloud_url, total_clicks, is_active, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (linksError) {
      console.error("[list-user-links] Database error:", linksError);
      // Real database error - return error state
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          kind: "ERROR",
          count: 0,
          links: [],
          message: "Failed to fetch links",
          error: linksError.message,
        }),
      };
    }

    const linkCount = links?.length || 0;
    console.log(`[list-user-links] Found ${linkCount} smart links`);

    // Case A: Links exist
    if (linkCount > 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          kind: "OK",
          count: linkCount,
          links: links,
          message: `Found ${linkCount} smart link${linkCount === 1 ? '' : 's'}.`,
        }),
      };
    }

    // Case B: No links (empty result is success, not error)
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        kind: "NO_LINKS",
        count: 0,
        links: [],
        message: "NO_LINKS",
      }),
    };
  } catch (err: any) {
    console.error("[list-user-links] Fatal error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err.message || "Unexpected error",
      }),
    };
  }
};
