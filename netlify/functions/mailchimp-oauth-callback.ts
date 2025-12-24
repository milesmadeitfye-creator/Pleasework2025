/**
 * Mailchimp: part of the Ghoste.one integration.
 * OAuth callback handler for Mailchimp authorization flow.
 *
 * IMPORTANT: This function MUST be build-safe.
 * - Do NOT throw if env vars are missing at import time.
 * - Check env vars inside the handler and return error response if missing.
 */
import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// Safe defaults - will be validated in handler
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const MAILCHIMP_CLIENT_ID = process.env.MAILCHIMP_CLIENT_ID || "";
const MAILCHIMP_CLIENT_SECRET = process.env.MAILCHIMP_CLIENT_SECRET || "";
const MAILCHIMP_REDIRECT_URI = process.env.MAILCHIMP_REDIRECT_URI || "";

// Only create client if env vars exist
function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase configuration missing");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function renderHtml(status: "success" | "error", message: string) {
  const safeMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const jsonMessage = JSON.stringify(message);

  if (status === "success") {
    return `<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;">
    <script>
      (function () {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              { provider: 'mailchimp', status: 'success' },
              '*'
            );
          }
        } catch (err) {
          console.error(err);
        } finally {
          window.close();
        }
      })();
    </script>
    <noscript>
      Mailchimp connected successfully. You can close this window.
    </noscript>
  </body>
</html>`;
  } else {
    return `<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;">
    <h2>Mailchimp connection failed</h2>
    <p>${safeMessage}</p>
    <script>
      (function () {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              { provider: 'mailchimp', status: 'error', message: ${jsonMessage} },
              '*'
            );
          }
        } catch (err) {
          console.error(err);
        } finally {
          window.close();
        }
      })();
    </script>
  </body>
</html>`;
  }
}

const handler: Handler = async (event) => {
  try {
    console.log("[mailchimp-oauth-callback] Received callback", {
      hasCode: !!event.queryStringParameters?.code,
      hasState: !!event.queryStringParameters?.state,
    });

    if (!MAILCHIMP_CLIENT_ID || !MAILCHIMP_CLIENT_SECRET || !MAILCHIMP_REDIRECT_URI) {
      const msg = `Missing Mailchimp env vars on server`;
      console.error("[mailchimp-oauth-callback] Missing env vars", {
        hasClientId: !!MAILCHIMP_CLIENT_ID,
        hasClientSecret: !!MAILCHIMP_CLIENT_SECRET,
        hasRedirectUri: !!MAILCHIMP_REDIRECT_URI,
      });
      return {
        statusCode: 500,
        headers: { "Content-Type": "text/html" },
        body: renderHtml("error", msg),
      };
    }

    const { code, state } = event.queryStringParameters ?? {};
    if (!code || !state) {
      throw new Error("Missing code or state");
    }

    let userId: string;
    try {
      const decoded = JSON.parse(decodeURIComponent(state));
      userId = decoded.user_id;
      if (!userId) throw new Error("Missing user_id in state");
    } catch (e) {
      console.error("mailchimp-oauth-callback invalid state", e);
      throw new Error("Invalid state parameter");
    }

    console.log("[mailchimp-oauth-callback] Starting token exchange", {
      hasCode: !!code,
      redirectUri: MAILCHIMP_REDIRECT_URI,
      userId: userId.substring(0, 8) + "...",
    });

    // 1) Exchange code for token using client_id + client_secret in body
    const tokenRes = await fetch("https://login.mailchimp.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: MAILCHIMP_CLIENT_ID,
        client_secret: MAILCHIMP_CLIENT_SECRET,
        redirect_uri: MAILCHIMP_REDIRECT_URI,
        code,
      }).toString(),
    });

    const tokenText = await tokenRes.text();
    console.log("[mailchimp-oauth-callback] Token response", {
      status: tokenRes.status,
      ok: tokenRes.ok,
      hasResponse: !!tokenText,
    });

    if (!tokenRes.ok) {
      throw new Error(
        `Mailchimp token exchange failed: ${tokenRes.status} - ${tokenText}`
      );
    }

    const tokenJson: any = JSON.parse(tokenText || "{}");
    const access_token = tokenJson.access_token as string;
    const refresh_token = tokenJson.refresh_token as string | undefined;
    const expires_in = tokenJson.expires_in as number | undefined;

    if (!access_token) {
      throw new Error("Missing access_token from Mailchimp response");
    }

    // 2) Metadata
    const metaRes = await fetch("https://login.mailchimp.com/oauth2/metadata", {
      headers: { Authorization: `OAuth ${access_token}` },
    });

    const metaText = await metaRes.text();
    console.log("[mailchimp-oauth-callback] Metadata response", {
      status: metaRes.status,
      ok: metaRes.ok,
      hasResponse: !!metaText,
    });

    if (!metaRes.ok) {
      throw new Error(
        `Mailchimp metadata failed: ${metaRes.status} - ${metaText}`
      );
    }

    const meta: any = JSON.parse(metaText || "{}");
    const data_center = meta.dc ?? null;
    const api_endpoint = meta.api_endpoint ?? null;
    const account_id = meta.user_id ?? meta.login?.id ?? null;

    const now = new Date().toISOString();

    // Construct Mailchimp API key in format: {access_token}-{dc}
    // This is the standard format for Mailchimp API keys
    const mailchimp_api_key = data_center ? `${access_token}-${data_center}` : access_token;

    // 3) Save to user_integrations table (used by sync/send functions)
    console.log("[mailchimp-oauth-callback] Attempting to save connection", {
      userId: userId.substring(0, 8) + "...",
      hasAccessToken: !!access_token,
      dataCenter: data_center,
      apiEndpoint: api_endpoint,
    });

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("user_integrations")
      .upsert(
        {
          user_id: userId,
          platform: "mailchimp",
          provider: "mailchimp",
          access_token: access_token,
          mailchimp_dc: data_center,
          mailchimp_account_id: account_id,
          mailchimp_status: "pending_setup",
          server_prefix: data_center,
          is_active: true,
          api_key: mailchimp_api_key,
          updated_at: now,
        },
        {
          onConflict: "user_id,provider",
        }
      )
      .select("id, user_id")
      .limit(1);

    // Verify the upsert succeeded before returning success
    if (error || !data || data.length === 0) {
      console.error("[mailchimp-oauth-callback] Failed to upsert user_integrations", {
        userId: userId.substring(0, 8) + "...",
        hasError: !!error,
        errorMessage: error?.message,
        dataLength: data?.length ?? 0,
      });

      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html" },
        body: renderHtml("error", error?.message || "Failed to save Mailchimp connection"),
      };
    }

    console.log("[mailchimp-oauth-callback] Connection saved and verified", {
      userId: userId.substring(0, 8) + "...",
      connectionId: data[0].id,
      hasAccessToken: !!access_token,
      dataCenter: data_center,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: renderHtml("success", "Mailchimp connected successfully!"),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error: " + String(error);
    console.error("[mailchimp-oauth-callback] Error during OAuth flow", message);

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: renderHtml("error", message),
    };
  }
};

export { handler };
