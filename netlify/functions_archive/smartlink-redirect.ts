import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. Smart Link redirects will not work."
  );
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

function getSmartLinkTarget(row: any): string {
  if (!row) return "";

  // Try different possible URL fields
  return (
    (row.spotify_url as string) ||
    (row.apple_music_url as string) ||
    (row.youtube_url as string) ||
    (row.primary_url as string) ||
    (row.destination_url as string) ||
    (row.target_url as string) ||
    (row.url as string) ||
    ""
  );
}

export const handler: Handler = async (event) => {
  // Extract short code from path
  const path = event.path || "";
  const parts = path.split("/").filter(Boolean);
  const codeFromPath = parts[parts.length - 1];

  const shortCode = event.queryStringParameters?.code || codeFromPath || "";

  if (!supabase) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Smart links are not configured.",
    };
  }

  if (!shortCode) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Missing smart link code.",
    };
  }

  try {
    // Query by slug (this database uses 'slug' not 'short_code')
    const { data, error } = await supabase
      .from("smart_links")
      .select("*")
      .eq("slug", shortCode)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("smartlink-redirect select error:", error);
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: "Error loading smart link.",
      };
    }

    if (!data) {
      // No row found: bad code
      return {
        statusCode: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: "Bad smart link.",
      };
    }

    // Get target URL
    const targetUrl = getSmartLinkTarget(data);

    if (!targetUrl) {
      // No valid destination URL - redirect to landing page instead
      const origin = "https://ghoste.one";
      const landingUrl = `${origin}/l/${shortCode}`;

      return {
        statusCode: 302,
        headers: {
          Location: landingUrl,
          "Cache-Control": "no-store",
        },
        body: "",
      };
    }

    // Increment click count (non-blocking)
    supabase
      .from("smart_links")
      .update({ total_clicks: (data.total_clicks ?? 0) + 1 })
      .eq("id", data.id)
      .then((response) => {
        if (response.error) {
          console.error("Failed to increment smart_link clicks:", response.error);
        }
      });

    // Redirect to target URL
    return {
      statusCode: 302,
      headers: {
        Location: targetUrl,
        "Cache-Control": "no-store",
      },
      body: "",
    };
  } catch (err: any) {
    console.error("smartlink-redirect fatal error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Unexpected error.",
    };
  }
};
