import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
    };
  }

  const slug = event.queryStringParameters?.slug;

  if (!slug) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        error: "Missing slug parameter",
      }),
    };
  }

  try {
    const { data: link, error: linkError } = await supabaseAdmin
      .from("smart_links")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (linkError) {
      console.error("[link-public] Error fetching link:", linkError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: "Failed to fetch link",
        }),
      };
    }

    if (!link) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          error: "Link not found",
        }),
      };
    }

    let metaPixelId: string | null = null;

    if (link.user_id) {
      // Load from meta_credentials (primary)
      const { data: creds } = await supabaseAdmin
        .from("meta_credentials")
        .select("pixel_id")
        .eq("user_id", link.user_id)
        .maybeSingle();

      if (creds?.pixel_id) {
        metaPixelId = creds.pixel_id;
        console.log(
          "[link-public] Found pixel_id from meta_credentials:",
          link.user_id,
          "=>",
          metaPixelId
        );
      } else {
        // Fallback to app_secrets
        const { data: secrets } = await supabaseAdmin
          .from("app_secrets")
          .select("key, value")
          .eq("user_id", link.user_id)
          .in("key", ["META_PIXEL_ID", "META_PIXEL", "PIXEL_ID"])
          .limit(3);

        const pixelKey = secrets?.find(s => ["META_PIXEL_ID", "META_PIXEL", "PIXEL_ID"].includes(s.key));
        if (pixelKey?.value) {
          metaPixelId = pixelKey.value;
          console.log(
            "[link-public] Found pixel from app_secrets:",
            link.user_id,
            "=>",
            metaPixelId
          );
        }
      }
    }

    await supabaseAdmin
      .from("smart_links")
      .update({ total_clicks: (link.total_clicks || 0) + 1 })
      .eq("id", link.id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        link,
        metaPixelId,
      }),
    };
  } catch (err: any) {
    console.error("[link-public] Fatal error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err.message || "Unexpected error",
      }),
    };
  }
};
