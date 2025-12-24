/**
 * TikTok Login OAuth Start
 *
 * REQUIRED NETLIFY ENVIRONMENT VARIABLES:
 * - TIKTOK_CLIENT_KEY: Your TikTok app client key
 * - TIKTOK_LOGIN_REDIRECT_URI: Full callback URL (e.g., https://ghoste.one/.netlify/functions/tiktok-login-callback)
 *
 * TIKTOK DEVELOPER PORTAL CONFIGURATION:
 * - Add redirect URI matching TIKTOK_LOGIN_REDIRECT_URI
 * - Enable required scopes: user.info.basic
 */

import type { Handler } from "@netlify/functions";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const redirectUri = process.env.TIKTOK_LOGIN_REDIRECT_URI;

    const { user_id } = event.queryStringParameters ?? {};

    if (!user_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: "Missing user_id parameter"
        }),
      };
    }

    if (!clientKey || !redirectUri) {
      console.error("[tiktok-login-start] TikTok OAuth not configured", {
        hasClientKey: !!clientKey,
        hasRedirectUri: !!redirectUri,
      });
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          code: "NOT_CONFIGURED",
          message: "TikTok login is not configured. Please set TIKTOK_CLIENT_KEY and TIKTOK_LOGIN_REDIRECT_URI."
        }),
      };
    }

    // Generate state with user_id
    const state = encodeURIComponent(JSON.stringify({ user_id }));

    // Build TikTok OAuth URL using env redirectUri
    const authUrl = `https://www.tiktok.com/auth/authorize/?client_key=${clientKey}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=user.info.basic&state=${state}`;

    console.log("[tiktok-login-start] Returning TikTok OAuth URL", {
      userId: user_id,
      redirectUri: redirectUri,
    });

    // Return the URL as JSON so frontend can redirect via window.location
    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        url: authUrl,
      }),
    };
  } catch (error) {
    console.error("[tiktok-login-start] Unexpected error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        code: "ERROR",
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};

export { handler };
export default handler;
