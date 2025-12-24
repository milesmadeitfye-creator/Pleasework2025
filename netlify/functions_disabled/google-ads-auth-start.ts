import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_ADS_CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const GOOGLE_ADS_REDIRECT_URI = process.env.GOOGLE_ADS_REDIRECT_URI;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

export const handler: Handler = async (event) => {
  if (!supabase || !GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_REDIRECT_URI) {
    console.error("[google-ads-auth-start] Missing required environment variables");
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=google_ads_config_missing",
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
    console.error("[google-ads-auth-start] Auth error:", authError);
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

  // Google Ads OAuth URL
  // Docs: https://developers.google.com/google-ads/api/docs/oauth/overview
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_ADS_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", GOOGLE_ADS_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/adwords");
  authUrl.searchParams.set("state", encodedState);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  console.log("[google-ads-auth-start] Redirecting user to Google Ads OAuth:", user.id);

  return {
    statusCode: 302,
    headers: {
      Location: authUrl.toString(),
      "Cache-Control": "no-store",
    },
    body: "",
  };
};
