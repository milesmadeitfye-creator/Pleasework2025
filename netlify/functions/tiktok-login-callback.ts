/**
 * TikTok Login OAuth Callback
 *
 * REQUIRED NETLIFY ENVIRONMENT VARIABLES:
 * - TIKTOK_CLIENT_KEY: Your TikTok app client key
 * - TIKTOK_CLIENT_SECRET: Your TikTok app client secret
 * - TIKTOK_LOGIN_REDIRECT_URI: Full callback URL (e.g., https://ghoste.one/.netlify/functions/tiktok-login-callback)
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key
 *
 * This callback:
 * 1. Exchanges authorization code for access token
 * 2. Fetches TikTok user info
 * 3. Stores connection in tiktok_connections table
 * 4. Returns HTML that posts message to opener window and closes popup
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const handler: Handler = async (event) => {
  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const redirectUri = process.env.TIKTOK_LOGIN_REDIRECT_URI;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { code, state, error: tiktokError, error_description } = event.queryStringParameters ?? {};

    if (tiktokError) {
      console.error("[tiktok-login-callback] TikTok error:", {
        error: tiktokError,
        description: error_description,
      });
      throw new Error(`TikTok OAuth error: ${tiktokError} - ${error_description || 'Unknown error'}`);
    }

    if (!code || !state) {
      throw new Error("Missing code or state parameter");
    }

    // Decode state to get user_id
    let userId: string;
    try {
      const decoded = JSON.parse(decodeURIComponent(state));
      userId = decoded.user_id;
      if (!userId) throw new Error("Missing user_id in state");
    } catch (e) {
      throw new Error("Invalid state parameter");
    }

    if (!clientKey || !clientSecret || !redirectUri) {
      console.error("[tiktok-login-callback] TikTok OAuth not configured", {
        hasClientKey: !!clientKey,
        hasClientSecret: !!clientSecret,
        hasRedirectUri: !!redirectUri,
      });
      throw new Error("TikTok login is not configured on the server");
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[tiktok-login-callback] Supabase not configured");
      throw new Error("Supabase is not configured on the server");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Exchange code for token using redirectUri from env
    const tokenUrl = "https://open.tiktokapis.com/v2/oauth/token/";
    const tokenBody = {
      client_key: clientKey,
      client_secret: clientSecret,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    };

    console.log("[tiktok-login-callback] Exchanging code for token", { userId });

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(tokenBody as any).toString(),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error("[tiktok-login-callback] TikTok error:", errorData);
      throw new Error(`TikTok token exchange failed: ${errorData?.error?.message || errorText}`);
    }

    const tokenJson: any = await tokenRes.json();

    if (tokenJson.error) {
      console.error("[tiktok-login-callback] TikTok error:", tokenJson.error);
      throw new Error(`TikTok API error: ${tokenJson.error.message || tokenJson.error.code}`);
    }

    const access_token = tokenJson.data?.access_token;
    const refresh_token = tokenJson.data?.refresh_token || null;
    const expires_in = tokenJson.data?.expires_in ?? null;
    const open_id = tokenJson.data?.open_id;

    if (!access_token || !open_id) {
      console.error("[tiktok-login-callback] Missing access_token or open_id:", tokenJson);
      throw new Error("Missing access_token or open_id in TikTok response");
    }

    // Fetch user info from TikTok
    const userInfoUrl = "https://open.tiktokapis.com/v2/user/info/";
    const userInfoRes = await fetch(userInfoUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!userInfoRes.ok) {
      const errorText = await userInfoRes.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error("[tiktok-login-callback] TikTok error:", errorData);
      throw new Error(`Failed to fetch TikTok user info: ${errorData?.error?.message || errorText}`);
    }

    const userInfoJson: any = await userInfoRes.json();

    if (userInfoJson.error) {
      console.error("[tiktok-login-callback] TikTok error:", userInfoJson.error);
      throw new Error(`TikTok user info error: ${userInfoJson.error.message || userInfoJson.error.code}`);
    }

    const userData = userInfoJson.data?.user;

    if (!userData) {
      console.error("[tiktok-login-callback] No user data:", userInfoJson);
      throw new Error("No user data from TikTok");
    }

    const tiktok_user_id = open_id;
    const username = userData.username || userData.display_name || null;
    const display_name = userData.display_name || null;
    const avatar_url = userData.avatar_url || userData.avatar_url_100 || null;

    const expires_at = expires_in
      ? new Date(Date.now() + expires_in * 1000).toISOString()
      : null;

    const now = new Date().toISOString();

    // Save to tiktok_connections table
    console.log("[tiktok-login-callback] Saving TikTok connection for user", userId);

    const { error: dbError } = await supabase
      .from("tiktok_connections")
      .upsert(
        {
          user_id: userId,
          tiktok_user_id,
          username,
          display_name,
          avatar_url,
          access_token,
          refresh_token,
          expires_at,
          connected_at: now,
          updated_at: now,
        },
        { onConflict: "user_id,tiktok_user_id" }
      );

    if (dbError) {
      console.error("[tiktok-login-callback] Supabase upsert error:", dbError);
      throw new Error(dbError.message);
    }

    console.log("[tiktok-login-callback] TikTok connection saved successfully");

    const html = `
<!DOCTYPE html>
<html>
  <body>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage(
            { provider: "tiktok", status: "success" },
            "*"
          );
        }
      } catch (e) {
        console.error(e);
      }
      window.close();
    </script>
    <p>TikTok account connected. You can close this window.</p>
  </body>
</html>
    `.trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: html,
    };
  } catch (error) {
    console.error("[tiktok-login-callback] Unexpected error:", error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    const html = `
<!DOCTYPE html>
<html>
  <body>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage(
            { provider: "tiktok", status: "error", error: ${JSON.stringify(errorMessage)} },
            "*"
          );
        }
      } catch (e) {
        console.error(e);
      }
      window.close();
    </script>
    <p>Failed to connect TikTok: ${errorMessage}</p>
  </body>
</html>
    `.trim();

    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: html,
    };
  }
};

export { handler };
export default handler;
