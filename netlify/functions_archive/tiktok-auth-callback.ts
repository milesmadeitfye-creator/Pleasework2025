/**
 * TikTok OAuth Callback - Creator/Connected Accounts Flow
 *
 * REQUIRED NETLIFY ENVIRONMENT VARIABLES:
 * - TIKTOK_CLIENT_KEY: Your TikTok app client key
 * - TIKTOK_CLIENT_SECRET: Your TikTok app client secret
 * - TIKTOK_REDIRECT_URI: https://ghoste.one/.netlify/functions/tiktok-auth-callback
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key
 *
 * This callback:
 * 1. Exchanges authorization code for access token
 * 2. Fetches TikTok user info
 * 3. Stores connection in user_integrations table
 * 4. Redirects to dashboard with success/error status
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const handler: Handler = async (event) => {
  try {
    const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
    const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
    const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { code, state } = event.queryStringParameters ?? {};

    if (!code) {
      return {
        statusCode: 302,
        headers: {
          Location: "/dashboard/connected-accounts?tiktok=error&reason=missing_code",
        },
        body: "",
      };
    }

    if (!state) {
      return {
        statusCode: 302,
        headers: {
          Location: "/dashboard/connected-accounts?tiktok=error&reason=invalid_state",
        },
        body: "",
      };
    }

    // Decode and validate state
    let userId: string;
    try {
      const decoded = JSON.parse(decodeURIComponent(state));
      userId = decoded.user_id;
      if (!userId) throw new Error("Missing user_id in state");
    } catch (e) {
      console.error("[tiktok-auth-callback] Invalid state parameter:", e);
      return {
        statusCode: 302,
        headers: {
          Location: "/dashboard/connected-accounts?tiktok=error&reason=invalid_state",
        },
        body: "",
      };
    }

    if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET || !TIKTOK_REDIRECT_URI) {
      console.error("[tiktok-auth-callback] TikTok OAuth not configured", {
        hasClientKey: !!TIKTOK_CLIENT_KEY,
        hasClientSecret: !!TIKTOK_CLIENT_SECRET,
        hasRedirectUri: !!TIKTOK_REDIRECT_URI,
      });
      return {
        statusCode: 302,
        headers: {
          Location: "/dashboard/connected-accounts?tiktok=error&reason=config_missing",
        },
        body: "",
      };
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[tiktok-auth-callback] Supabase not configured");
      return {
        statusCode: 302,
        headers: {
          Location: "/dashboard/connected-accounts?tiktok=error&reason=config_missing",
        },
        body: "",
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Exchange code for access token
    const tokenUrl = "https://open.tiktokapis.com/v2/oauth/token/";
    const tokenBody = new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: TIKTOK_REDIRECT_URI,
    });

    console.log("[tiktok-auth-callback] Exchanging code for token", { userId });

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("[tiktok-auth-callback] Token exchange failed:", tokenRes.status, text);
      return {
        statusCode: 302,
        headers: {
          Location: "/dashboard/connected-accounts?tiktok=error&reason=token_exchange_failed",
        },
        body: "",
      };
    }

    const tokenJson: any = await tokenRes.json();

    if (tokenJson.error || !tokenJson.data) {
      console.error("[tiktok-auth-callback] Token response error:", tokenJson);
      return {
        statusCode: 302,
        headers: {
          Location: "/dashboard/connected-accounts?tiktok=error&reason=token_exchange_failed",
        },
        body: "",
      };
    }

    const access_token = tokenJson.data.access_token as string;
    const refresh_token = tokenJson.data.refresh_token as string;
    const expires_in = tokenJson.data.expires_in ?? null;
    const open_id = tokenJson.data.open_id as string;

    if (!access_token || !open_id) {
      console.error("[tiktok-auth-callback] Missing access_token or open_id in TikTok response");
      return {
        statusCode: 302,
        headers: {
          Location: "/dashboard/connected-accounts?tiktok=error&reason=token_exchange_failed",
        },
        body: "",
      };
    }

    // Fetch user info from TikTok
    const userInfoUrl = "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name";
    const userInfoRes = await fetch(userInfoUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    });

    let display_name = null;
    let avatar_url = null;

    if (userInfoRes.ok) {
      const userInfoJson: any = await userInfoRes.json();
      if (userInfoJson.data && userInfoJson.data.user) {
        display_name = userInfoJson.data.user.display_name || null;
        avatar_url = userInfoJson.data.user.avatar_url || null;
      }
    } else {
      console.warn("[tiktok-auth-callback] Failed to fetch TikTok user info, continuing without it");
    }

    const expires_at = expires_in
      ? new Date(Date.now() + expires_in * 1000).toISOString()
      : null;

    const now = new Date().toISOString();

    // Store in user_integrations table with provider = 'tiktok'
    console.log("[tiktok-auth-callback] Storing TikTok connection for user", userId);

    const { error: dbError } = await supabase
      .from("user_integrations")
      .upsert(
        {
          user_id: userId,
          provider: "tiktok",
          platform: "tiktok",
          access_token: access_token,
          refresh_token: refresh_token || "",
          external_account_id: open_id,
          meta: {
            open_id,
            display_name,
            avatar_url,
          },
          expires_at: expires_at,
          connected_at: now,
          is_active: true,
          updated_at: now,
        },
        { onConflict: "user_id,provider" }
      );

    if (dbError) {
      console.error("[tiktok-auth-callback] Supabase TikTok integration upsert error:", dbError);
      return {
        statusCode: 302,
        headers: {
          Location: "/dashboard/connected-accounts?tiktok=error&reason=database_error",
        },
        body: "",
      };
    }

    console.log("[tiktok-auth-callback] TikTok connection saved successfully");

    // Success redirect
    return {
      statusCode: 302,
      headers: {
        Location: "/dashboard/connected-accounts?tiktok=success",
      },
      body: "",
    };
  } catch (error: any) {
    console.error("[tiktok-auth-callback] Unexpected error:", error);
    return {
      statusCode: 302,
      headers: {
        Location: "/dashboard/connected-accounts?tiktok=error&reason=unexpected",
      },
      body: "",
    };
  }
};

export { handler };
