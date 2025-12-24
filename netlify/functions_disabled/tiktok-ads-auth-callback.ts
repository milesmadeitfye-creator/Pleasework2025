import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TIKTOK_ADS_CLIENT_ID = process.env.TIKTOK_ADS_CLIENT_ID;
const TIKTOK_ADS_CLIENT_SECRET = process.env.TIKTOK_ADS_CLIENT_SECRET;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

export const handler: Handler = async (event) => {
  const params = event.queryStringParameters || {};
  const authCode = params.auth_code;
  const state = params.state;

  if (!supabase || !TIKTOK_ADS_CLIENT_ID || !TIKTOK_ADS_CLIENT_SECRET) {
    console.error("[tiktok-ads-callback] Missing required environment variables");
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=tiktok_config_missing",
      },
      body: "",
    };
  }

  if (!authCode) {
    console.error("[tiktok-ads-callback] Missing auth_code");
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=tiktok_missing_code",
      },
      body: "",
    };
  }

  if (!state) {
    console.error("[tiktok-ads-callback] Missing state");
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=tiktok_invalid_state",
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
    console.error("[tiktok-ads-callback] State validation error:", err);
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=tiktok_invalid_state",
      },
      body: "",
    };
  }

  try {
    // Exchange auth_code for access token
    // TikTok Ads API docs: https://ads.tiktok.com/marketing_api/docs?id=1738373164380162
    const tokenResponse = await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app_id: TIKTOK_ADS_CLIENT_ID,
        secret: TIKTOK_ADS_CLIENT_SECRET,
        auth_code: authCode,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("[tiktok-ads-callback] Token exchange failed:", errorText);
      return {
        statusCode: 302,
        headers: {
          Location: "/connected-accounts?error=tiktok_token_exchange_failed",
        },
        body: "",
      };
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.data || !tokenData.data.access_token) {
      console.error("[tiktok-ads-callback] No access token in response:", tokenData);
      return {
        statusCode: 302,
        headers: {
          Location: "/connected-accounts?error=tiktok_token_exchange_failed",
        },
        body: "",
      };
    }

    const accessToken = tokenData.data.access_token;
    const advertiserIds = tokenData.data.advertiser_ids || [];
    const advertiserId = advertiserIds[0] || null;

    // Fetch advertiser info if we have an ID
    let accountName = "TikTok Ads Account";
    if (advertiserId) {
      try {
        const advertiserResponse = await fetch("https://business-api.tiktok.com/open_api/v1.3/advertiser/info/", {
          method: "GET",
          headers: {
            "Access-Token": accessToken,
          },
        });

        if (advertiserResponse.ok) {
          const advertiserData = await advertiserResponse.json();
          if (advertiserData.data && advertiserData.data.list && advertiserData.data.list[0]) {
            accountName = advertiserData.data.list[0].name || accountName;
          }
        }
      } catch (err) {
        console.error("[tiktok-ads-callback] Failed to fetch advertiser info:", err);
      }
    }

    // Upsert connected account
    const { error: dbError } = await supabase
      .from("connected_ad_accounts")
      .upsert({
        user_id: userId,
        platform: "tiktok_ads",
        external_account_id: advertiserId,
        account_name: accountName,
        access_token: accessToken,
        refresh_token: null,
        status: "connected",
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,platform",
      });

    if (dbError) {
      console.error("[tiktok-ads-callback] Database error:", dbError);
      return {
        statusCode: 302,
        headers: {
          Location: "/connected-accounts?error=tiktok_database_error",
        },
        body: "",
      };
    }

    console.log("[tiktok-ads-callback] Successfully connected TikTok Ads for user:", userId);

    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?connected=tiktok_ads",
      },
      body: "",
    };
  } catch (err: any) {
    console.error("[tiktok-ads-callback] Unexpected error:", err);
    return {
      statusCode: 302,
      headers: {
        Location: "/connected-accounts?error=tiktok_unexpected_error",
      },
      body: "",
    };
  }
};
