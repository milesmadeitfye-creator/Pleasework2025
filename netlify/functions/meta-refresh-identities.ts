import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Get user ID and Meta access token from request
 * Reuses the same auth pattern as meta-sync-pixels.ts
 */
async function getUserAndToken(event: any): Promise<{
  userId: string;
  metaToken: string;
  adAccountId: string;
}> {
  // Verify JWT from Authorization header
  const authHeader = event.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const token = authHeader.replace("Bearer ", "");

  // Verify the JWT and get the user
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    throw new Error("Invalid or expired token");
  }

  console.log("[meta-refresh-identities] User verified:", user.id.substring(0, 8) + "...");

  // Get Meta credentials from database
  const { data: creds, error: credsError } = await supabaseAdmin
    .from("meta_credentials")
    .select("access_token, ad_account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (credsError || !creds?.access_token) {
    throw new Error("No Meta credentials found. Please connect your Meta account.");
  }

  // Normalize ad account ID (remove act_ prefix if present)
  let adAccountId = creds.ad_account_id || "";
  if (!adAccountId.startsWith("act_") && /^\d+$/.test(adAccountId)) {
    adAccountId = `act_${adAccountId}`;
  }

  console.log("[meta-refresh-identities] Credentials loaded:", {
    userId: user.id.substring(0, 8) + "...",
    hasToken: !!creds.access_token,
    adAccountId: adAccountId.substring(0, 15) + "...",
  });

  return {
    userId: user.id,
    metaToken: creds.access_token,
    adAccountId,
  };
}

export const handler: Handler = async (event) => {
  console.log("[meta-refresh-identities] Request received");

  // Handle OPTIONS for CORS
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
      body: JSON.stringify({ success: false, error: "method_not_allowed" }),
    };
  }

  try {
    // Get user and token
    const { userId, metaToken, adAccountId } = await getUserAndToken(event);

    console.log("[meta-refresh-identities] Fetching Pages from Meta API");

    // Call Meta Graph API to get Pages with Instagram Business Accounts
    const url = `https://graph.facebook.com/${META_API_VERSION}/me/accounts?fields=id,name,instagram_business_account{username,id}&limit=200`;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${metaToken}` },
    });

    const json = await resp.json();

    if (!resp.ok) {
      console.error("[meta-refresh-identities] Meta API error:", json);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: "meta_graph_failed",
          message: json?.error?.message || "Failed to fetch Pages from Meta",
          metaError: json,
        }),
      };
    }

    const pages: any[] = json?.data || [];

    console.log("[meta-refresh-identities] Pages fetched:", {
      total: pages.length,
      withInstagram: pages.filter(p => p.instagram_business_account?.id).length,
    });

    // Build rows for upsert
    const rows = pages.map((p) => ({
      user_id: userId,
      ad_account_id: adAccountId,
      page_id: p.id,
      page_name: p.name ?? null,
      instagram_actor_id: p.instagram_business_account?.id ?? null,
      instagram_username: p.instagram_business_account?.username ?? null,
      is_active: true,
      last_synced_at: new Date().toISOString(),
    }));

    if (rows.length === 0) {
      console.warn("[meta-refresh-identities] No Pages found for user");
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          count: 0,
          pages_with_instagram: 0,
          message: "No Facebook Pages found. Make sure you've granted pages_show_list permission.",
        }),
      };
    }

    // Upsert into database
    console.log("[meta-refresh-identities] Upserting", rows.length, "identities");

    const { error: upsertError } = await supabaseAdmin
      .from("meta_ad_identity")
      .upsert(rows, {
        onConflict: "user_id,ad_account_id,page_id",
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error("[meta-refresh-identities] Database upsert failed:", upsertError);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: "db_upsert_failed",
          message: "Failed to save identities to database",
          details: upsertError.message,
        }),
      };
    }

    const pagesWithInstagram = rows.filter((r) => !!r.instagram_actor_id).length;

    console.log("[meta-refresh-identities] Success:", {
      totalPages: rows.length,
      pagesWithInstagram,
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        count: rows.length,
        pages_with_instagram: pagesWithInstagram,
        message: `Refreshed ${rows.length} Pages (${pagesWithInstagram} with Instagram)`,
        identities: rows.map(r => ({
          page_id: r.page_id,
          page_name: r.page_name,
          has_instagram: !!r.instagram_actor_id,
          instagram_username: r.instagram_username,
        })),
      }),
    };
  } catch (e: any) {
    console.error("[meta-refresh-identities] Error:", e);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: "server_error",
        message: e?.message || String(e),
      }),
    };
  }
};
