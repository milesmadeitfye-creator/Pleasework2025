/**
 * Mailchimp: part of the Ghoste.one integration.
 * OAuth Start - Initiates Mailchimp authorization flow.
 *
 * IMPORTANT: This function MUST be build-safe.
 * - Do NOT throw if env vars are missing at import time.
 * - Check env vars inside the handler and redirect with error if missing.
 *
 * Purpose:
 * - Initiates Mailchimp OAuth by redirecting user to Mailchimp's authorization page
 * - Accepts optional redirectTo query param to return user to specific page after auth
 *
 * Environment Variables Required:
 * - MAILCHIMP_CLIENT_ID: OAuth app client ID from Mailchimp
 * - MAILCHIMP_REDIRECT_URI: Callback URL registered with Mailchimp (https://ghoste.one/mailchimp/callback)
 *
 * Flow:
 * 1. User clicks "Connect Mailchimp" → calls this function
 * 2. Build authorization URL with client_id and redirect_uri
 * 3. Optionally encode state with redirectTo path
 * 4. Redirect user to Mailchimp login page
 * 5. User approves → Mailchimp calls our callback function
 */
import type { Handler } from "@netlify/functions";

// Safe defaults - will be validated in handler
const MAILCHIMP_CLIENT_ID = process.env.MAILCHIMP_CLIENT_ID || "";
const MAILCHIMP_REDIRECT_URI = process.env.MAILCHIMP_REDIRECT_URI || "";

export const handler: Handler = async (event) => {
  console.log("[MailchimpOAuth] Starting OAuth flow", {
    method: event.httpMethod,
    hasClientId: !!MAILCHIMP_CLIENT_ID,
    hasRedirectUri: !!MAILCHIMP_REDIRECT_URI,
  });

  try {
    if (!MAILCHIMP_CLIENT_ID || !MAILCHIMP_REDIRECT_URI) {
      console.error("[MailchimpOAuth] Missing Mailchimp env vars", {
        hasClientId: !!MAILCHIMP_CLIENT_ID,
        hasRedirectUri: !!MAILCHIMP_REDIRECT_URI,
      });

      return {
        statusCode: 302,
        headers: {
          Location: "https://ghoste.one/dashboard?mailchimp=error&reason=server_config",
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    // Get optional redirectTo from query params (default to dashboard)
    const redirectTo = event.queryStringParameters?.redirectTo || "/dashboard";
    const user_id = event.queryStringParameters?.user_id || event.queryStringParameters?.userId || "";

    // Encode state with redirectTo so we can restore it after OAuth
    const state = encodeURIComponent(
      JSON.stringify({
        redirectTo,
        user_id,
        timestamp: Date.now(),
      })
    );

    // Build Mailchimp authorization URL
    const authUrl = new URL("https://login.mailchimp.com/oauth2/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", MAILCHIMP_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", MAILCHIMP_REDIRECT_URI);
    authUrl.searchParams.set("state", state);

    console.log("[MailchimpOAuth] Redirecting to Mailchimp authorization", {
      redirectTo,
      user_id: user_id ? "present" : "missing",
      redirectUri: MAILCHIMP_REDIRECT_URI,
      authUrl: authUrl.origin + authUrl.pathname,
    });

    return {
      statusCode: 302,
      headers: {
        Location: authUrl.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
      body: "",
    };
  } catch (err: any) {
    console.error("[MailchimpOAuth] Unexpected error in start flow", {
      message: err.message,
      stack: err.stack,
    });

    return {
      statusCode: 302,
      headers: {
        Location: "https://ghoste.one/dashboard?mailchimp=error&reason=server_error",
        "Cache-Control": "no-cache",
      },
      body: "",
    };
  }
};
