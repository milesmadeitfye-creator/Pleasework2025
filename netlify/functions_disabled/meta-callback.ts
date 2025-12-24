import type { Handler } from "@netlify/functions";
import { getMetaConfig } from "./_metaConfig";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

export const handler: Handler = async (event) => {
  const timestamp = new Date().toISOString();
  console.log(`[meta-callback] ${timestamp} Route hit`, {
    method: event.httpMethod,
    hasCode: !!event.queryStringParameters?.code,
    hasState: !!event.queryStringParameters?.state,
    hasError: !!event.queryStringParameters?.error,
  });

  try {
    const { META_APP_ID, META_APP_SECRET, META_REDIRECT_URI, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } =
      getMetaConfig();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    const qs = event.queryStringParameters || {};
    const code = qs.code;
    const stateRaw = qs.state || "";
    const error = qs.error;
    const errorDesc = qs.error_description;

    // Handle OAuth provider errors
    if (error) {
      console.error("[meta-callback] Provider error", { error, errorDesc });
      return redirect(
        `/dashboard?tab=accounts&meta_status=error&reason=${encodeURIComponent(error)}`
      );
    }

    // Validate code parameter
    if (!code) {
      console.error("[meta-callback] Missing authorization code", { queryParams: Object.keys(qs) });
      return redirect(
        "/dashboard?tab=accounts&meta_status=error&reason=missing_code"
      );
    }

    // Decode and validate signed state
    let state: any = null;
    try {
      const META_SESSION_SECRET = process.env.META_SESSION_SECRET || "ghoste_meta_secret_key_2024";

      const parts = stateRaw.split(".");
      if (parts.length !== 2) {
        throw new Error("Invalid state format");
      }

      const [base, sig] = parts;
      const expectedSig = createHmac("sha256", META_SESSION_SECRET).update(base).digest("base64url");

      if (sig !== expectedSig) {
        throw new Error("Invalid signature");
      }

      const json = Buffer.from(base, "base64url").toString("utf8");
      state = JSON.parse(json);

      console.log("[meta-callback] State decoded", {
        userId: state?.userId?.substring(0, 8) + "...",
        hasTimestamp: !!state?.ts,
        hasRedirectPath: !!state?.redirectPath
      });
    } catch (e: any) {
      console.error("[meta-callback] Invalid state parameter", {
        error: e.message,
        stateLength: stateRaw.length
      });
      return redirect(
        "/dashboard?tab=accounts&meta_status=error&reason=invalid_state"
      );
    }

    const userId = state?.userId;
    if (!userId) {
      console.error("[meta-callback] Missing userId in state", { state });
      return redirect(
        "/dashboard?tab=accounts&meta_status=error&reason=missing_user"
      );
    }

    // Exchange authorization code for access token
    console.log("[meta-callback] Exchanging code for token", {
      userId: userId.substring(0, 8) + "...",
      redirectUri: META_REDIRECT_URI
    });

    const tokenRes = await fetch(
      "https://graph.facebook.com/v22.0/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          redirect_uri: META_REDIRECT_URI,
          code,
        }).toString(),
      }
    );

    const tokenText = await tokenRes.text();
    if (!tokenRes.ok) {
      console.error("[meta-callback] Token exchange failed", {
        status: tokenRes.status,
        statusText: tokenRes.statusText,
        bodyPreview: tokenText.substring(0, 200)
      });
      return redirect(
        "/dashboard?tab=accounts&meta_status=error&reason=token_error"
      );
    }

    let tokenJson;
    try {
      tokenJson = JSON.parse(tokenText);
    } catch (e) {
      console.error("[meta-callback] Token response not JSON", { bodyPreview: tokenText.substring(0, 200) });
      return redirect("/dashboard?tab=accounts&meta_status=error&reason=token_parse_error");
    }

    const accessToken = tokenJson.access_token;
    const expiresIn = tokenJson.expires_in;

    if (!accessToken) {
      console.error("[meta-callback] No access_token in response", {
        keys: Object.keys(tokenJson)
      });
      return redirect(
        "/dashboard?tab=accounts&meta_status=error&reason=no_access_token"
      );
    }

    console.log("[meta-callback] Token exchange success", {
      hasToken: true,
      expiresIn,
      tokenType: tokenJson.token_type
    });

    // Fetch user profile from Facebook
    console.log("[meta-callback] Fetching user profile");
    const meRes = await fetch(
      `https://graph.facebook.com/v22.0/me?fields=id,name&access_token=${encodeURIComponent(
        accessToken
      )}`
    );

    const meText = await meRes.text();
    if (!meRes.ok) {
      console.error("[meta-callback] Failed to fetch user info", {
        status: meRes.status,
        statusText: meRes.statusText,
        bodyPreview: meText.substring(0, 200)
      });
      return redirect(
        "/dashboard?tab=accounts&meta_status=error&reason=user_info_failed"
      );
    }

    let me;
    try {
      me = JSON.parse(meText);
    } catch (e) {
      console.error("[meta-callback] User info response not JSON", { bodyPreview: meText.substring(0, 200) });
      return redirect("/dashboard?tab=accounts&meta_status=error&reason=user_parse_error");
    }

    console.log("[meta-callback] User info retrieved", {
      metaUserId: me.id,
      metaUserName: me.name,
    });

    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    // Save connection to database
    console.log("[meta-callback] Saving to database", {
      userId: userId.substring(0, 8) + "...",
      metaUserId: me.id,
      supabaseUrl: SUPABASE_URL
    });

    const now = new Date().toISOString();

    const { data: insertedData, error: upsertError } = await supabase
      .from("meta_connections")
      .upsert({
        user_id: userId,
        meta_user_id: me.id,
        meta_user_name: me.name,
        access_token: accessToken,
        expires_at: expiresAt,
        connected_at: now,
        updated_at: now,
      }, {
        onConflict: 'user_id',
        ignoreDuplicates: false
      })
      .select();

    if (upsertError) {
      console.error("[meta-callback] Database save failed", {
        error: upsertError.message,
        code: upsertError.code,
        hint: upsertError.hint,
        details: upsertError.details
      });
      return redirect(
        "/dashboard?tab=accounts&meta_status=error&reason=db_error"
      );
    }

    console.log("[meta-callback] Connection saved successfully", {
      userId: userId.substring(0, 8) + "...",
      metaUserId: me.id,
      recordId: insertedData?.[0]?.id
    });

    // Redirect to dashboard with accounts tab open (or custom redirect path from state)
    const redirectPath = state?.redirectPath || "/dashboard?tab=accounts";
    console.log("[meta-callback] Redirecting to:", redirectPath);
    return redirect(
      `${redirectPath}${redirectPath.includes('?') ? '&' : '?'}meta_status=success`
    );
  } catch (err: any) {
    console.error("[meta-callback] Fatal error", {
      message: err.message,
      stack: err.stack,
    });
    return redirect(
      "/dashboard?tab=accounts&meta_status=error&reason=internal_error"
    );
  }
};

function redirect(location: string) {
  console.log("[meta-callback] Redirecting to:", location);
  return {
    statusCode: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
    body: "",
  };
}
