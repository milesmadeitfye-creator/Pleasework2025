import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TIKTOK_ADS_CLIENT_ID = process.env.TIKTOK_ADS_CLIENT_ID;
const TIKTOK_ADS_REDIRECT_URI = process.env.TIKTOK_ADS_REDIRECT_URI;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

export const handler: Handler = async (event) => {
  if (!supabase || !TIKTOK_ADS_CLIENT_ID || !TIKTOK_ADS_REDIRECT_URI) {
    console.error("[tiktok-ads-auth-start] Missing required environment variables");
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=tiktok_config_missing",
      },
      body: "",
    };
  }

  // Get user from Authorization header
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=not_authenticated",
      },
      body: "",
    };
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    console.error("[tiktok-ads-auth-start] Auth error:", authError);
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=not_authenticated",
      },
      body: "",
    };
  }

  // Generate CSRF state token
  const state = `${user.id}:${Date.now()}:${Math.random().toString(36).substring(7)}`;
  const encodedState = Buffer.from(state).toString("base64");

  // TikTok Ads OAuth URL
  // Docs: https://ads.tiktok.com/marketing_api/docs?id=1738373164380162
  const authUrl = new URL("https://business-api.tiktok.com/portal/auth");
  authUrl.searchParams.set("app_id", TIKTOK_ADS_CLIENT_ID);
  authUrl.searchParams.set("state", encodedState);
  authUrl.searchParams.set("redirect_uri", TIKTOK_ADS_REDIRECT_URI);
  authUrl.searchParams.set("rid", `ghoste_${user.id}_${Date.now()}`);

  console.log("[tiktok-ads-auth-start] Redirecting user to TikTok Ads OAuth:", user.id);

  return {
    statusCode: 302,
    headers: {
      Location: authUrl.toString(),
      "Cache-Control": "no-store",
    },
    body: "",
  };
};
