import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get user from Authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          meta: { connected: false },
          mailchimp: { connected: false },
          tiktok: { connected: false },
          error: "Not authenticated",
        }),
      };
    }

    // Verify token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error("[get-integrations-status] User verification failed:", userError);
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          meta: { connected: false },
          mailchimp: { connected: false },
          tiktok: { connected: false },
          error: "Invalid token",
        }),
      };
    }

    // Query user_integrations table for Meta (same pattern as Mailchimp)
    const { data: metaData, error: metaError } = await supabase
      .from("user_integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "meta")
      .maybeSingle();

    if (metaError && metaError.code !== 'PGRST116') { // PGRST116 = not found, which is ok
      console.error("[get-integrations-status] Meta query error:", metaError);
    }

    // Query user_integrations table for Mailchimp
    const { data: mailchimpData, error: mailchimpError } = await supabase
      .from("user_integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "mailchimp")
      .maybeSingle();

    if (mailchimpError && mailchimpError.code !== 'PGRST116') {
      console.error("[get-integrations-status] Mailchimp query error:", mailchimpError);
    }

    // Query tiktok_connections table for TikTok
    const { data: tiktokData, error: tiktokError } = await supabase
      .from("tiktok_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (tiktokError && tiktokError.code !== 'PGRST116') {
      console.error("[get-integrations-status] TikTok query error:", tiktokError);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        meta: {
          connected: !!metaData && metaData.is_active === true,
          details: metaData ? {
            externalAccountId: metaData.external_account_id,
            connectedAt: metaData.connected_at || metaData.created_at,
            expiresAt: metaData.expires_at,
            meta: {
              name: metaData.meta?.meta_user_name,
              ad_account_count: metaData.meta?.ad_account_count,
              facebook_page_count: metaData.meta?.facebook_page_count,
              instagram_account_count: metaData.meta?.instagram_account_count,
            },
          } : null,
        },
        mailchimp: {
          connected: !!mailchimpData,
          details: mailchimpData ? {
            externalAccountId: mailchimpData.external_account_id,
            connectedAt: mailchimpData.connected_at || mailchimpData.created_at,
            expiresAt: mailchimpData.expires_at,
            meta: mailchimpData.meta || {
              dc: mailchimpData.mailchimp_dc || mailchimpData.server_prefix,
              audience_id: mailchimpData.audience_id,
            },
          } : null,
        },
        tiktok: {
          connected: !!tiktokData,
          details: tiktokData ? {
            externalAccountId: tiktokData.tiktok_user_id,
            connectedAt: tiktokData.connected_at,
            expiresAt: tiktokData.expires_at,
            meta: {
              username: tiktokData.username,
              display_name: tiktokData.display_name,
              avatar_url: tiktokData.avatar_url,
            },
          } : null,
        },
      }),
    };
  } catch (err: any) {
    console.error("[get-integrations-status] Unexpected error:", err);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        meta: { connected: false },
        mailchimp: { connected: false },
        tiktok: { connected: false },
        error: err.message || "Unexpected error",
      }),
    };
  }
};
