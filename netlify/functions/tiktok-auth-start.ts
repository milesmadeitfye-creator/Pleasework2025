/**
 * TikTok OAuth - Creator/Connected Accounts Flow
 *
 * REQUIRED NETLIFY ENVIRONMENT VARIABLES:
 * - TIKTOK_CLIENT_KEY: Your TikTok app client key
 * - TIKTOK_CLIENT_SECRET: Your TikTok app client secret
 * - TIKTOK_REDIRECT_URI: https://ghoste.one/.netlify/functions/tiktok-auth-callback
 *
 * TIKTOK DEVELOPER PORTAL CONFIGURATION:
 * - Add redirect URI: https://ghoste.one/.netlify/functions/tiktok-auth-callback
 * - Enable required scopes: user.info.basic, video.list
 */

import type { Handler } from "@netlify/functions";

const handler: Handler = async (event) => {
  try {
    const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
    const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;

    const userId = event.queryStringParameters?.user_id;

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "missing_user",
          message: "User ID is required",
        }),
      };
    }

    if (!TIKTOK_CLIENT_KEY || !TIKTOK_REDIRECT_URI) {
      console.error("[tiktok-auth-start] TikTok OAuth not configured", {
        hasClientKey: !!TIKTOK_CLIENT_KEY,
        hasRedirectUri: !!TIKTOK_REDIRECT_URI,
      });
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "config_missing",
          message: "TikTok integration is not configured. Please set TIKTOK_CLIENT_KEY and TIKTOK_REDIRECT_URI environment variables.",
        }),
      };
    }

    // Create state parameter with user_id for security
    const state = encodeURIComponent(
      JSON.stringify({
        user_id: userId,
        timestamp: Date.now(),
      })
    );

    // Build TikTok OAuth authorization URL
    const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
    authUrl.searchParams.set("client_key", TIKTOK_CLIENT_KEY);
    authUrl.searchParams.set("scope", "user.info.basic,video.list");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", TIKTOK_REDIRECT_URI);
    authUrl.searchParams.set("state", state);

    console.log("[tiktok-auth-start] Redirecting to TikTok OAuth", {
      userId,
      redirectUri: TIKTOK_REDIRECT_URI,
    });

    // Redirect to TikTok OAuth
    return {
      statusCode: 302,
      headers: {
        Location: authUrl.toString(),
      },
      body: "",
    };
  } catch (error: any) {
    console.error("[tiktok-auth-start] Unexpected error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "unexpected",
        message: error.message || "Failed to start TikTok authorization",
      }),
    };
  }
};

export { handler };
