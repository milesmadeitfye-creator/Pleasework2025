import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_ADS_CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const GOOGLE_ADS_CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const GOOGLE_ADS_REDIRECT_URI = process.env.GOOGLE_ADS_REDIRECT_URI;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

export const handler: Handler = async (event) => {
  const params = event.queryStringParameters || {};
  const code = params.code;
  const state = params.state;

  if (!supabase || !GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET || !GOOGLE_ADS_REDIRECT_URI) {
    console.error("[google-ads-callback] Missing required environment variables");
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=google_ads_config_missing",
      },
      body: "",
    };
  }

  if (!code) {
    console.error("[google-ads-callback] Missing code");
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=google_ads_missing_code",
      },
      body: "",
    };
  }

  if (!state) {
    console.error("[google-ads-callback] Missing state");
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=google_ads_invalid_state",
      },
      body: "",
    };
  }

  // Decode and validate state
  let userId: string;
  try {
    const decodedState = Buffer.from(state, "base64").toString("utf-8");
    const parts = decodedState.split(":");
    userId = parts[0];

    if (!userId) {
      throw new Error("Invalid state format");
    }
  } catch (err) {
    console.error("[google-ads-callback] State validation error:", err);
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=google_ads_invalid_state",
      },
      body: "",
    };
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_ADS_CLIENT_ID,
        client_secret: GOOGLE_ADS_CLIENT_SECRET,
        redirect_uri: GOOGLE_ADS_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("[google-ads-callback] Token exchange failed:", errorText);
      return {
        statusCode: 302,
        headers: {
          Location: "/connected-accounts?error=google_ads_token_exchange_failed",
        },
        body: "",
      };
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error("[google-ads-callback] No access token in response:", tokenData);
      return {
        statusCode: 302,
        headers: {
          Location: "/connected-accounts?error=google_ads_token_exchange_failed",
        },
        body: "",
      };
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Fetch accessible customer accounts
    let accountName = "Google Ads Account";
    let externalAccountId = null;

    try {
      // Note: This requires the developer token to be configured in Google Ads API
      // For now, we'll just store the connection without fetching account details
      // Actual account fetching would require:
      // 1. Developer token
      // 2. Call to https://googleads.googleapis.com/v14/customers:listAccessibleCustomers
      // 3. Call to https://googleads.googleapis.com/v14/customers/{customer_id}
      console.log("[google-ads-callback] Google Ads connected, account details fetch requires developer token");
    } catch (err) {
      console.error("[google-ads-callback] Failed to fetch account info:", err);
    }

    // Upsert connected account
    const { error: dbError } = await supabase
      .from("connected_ad_accounts")
      .upsert({
        user_id: userId,
        platform: "google_ads",
        external_account_id: externalAccountId,
        account_name: accountName,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: expiresAt,
        status: "connected",
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,platform",
      });

    if (dbError) {
      console.error("[google-ads-callback] Database error:", dbError);
      return {
        statusCode: 302,
        headers: {
          Location: "/connected-accounts?error=google_ads_database_error",
        },
        body: "",
      };
    }

    console.log("[google-ads-callback] Successfully connected Google Ads for user:", userId);

    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?connected=google_ads",
      },
      body: "",
    };
  } catch (err: any) {
    console.error("[google-ads-callback] Unexpected error:", err);
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=google_ads_unexpected_error",
      },
      body: "",
    };
  }
};
