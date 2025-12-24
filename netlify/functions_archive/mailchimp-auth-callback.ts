import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MAILCHIMP_CLIENT_ID = process.env.MAILCHIMP_CLIENT_ID!;
const MAILCHIMP_CLIENT_SECRET = process.env.MAILCHIMP_CLIENT_SECRET!;
const MAILCHIMP_REDIRECT_URI = process.env.MAILCHIMP_REDIRECT_URI!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function renderHtml(status: "success" | "error", message: string) {
  const safeMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
<!DOCTYPE html>
<html>
  <body style="font-family: system-ui; padding: 16px;">
    <h2>Mailchimp connection ${status === "success" ? "successful" : "failed"}</h2>
    <pre>${safeMessage}</pre>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage(
            { provider: "mailchimp", status: "${status}", message: ${JSON.stringify(
              message
            )} },
            "*"
          );
        }
      } catch (e) {
        console.error(e);
      }
    </script>
    <p>You can close this window.</p>
  </body>
</html>
  `.trim();
}

const handler: Handler = async (event) => {
  try {
    console.log("[mailchimp-auth-callback] Received callback", {
      hasCode: !!event.queryStringParameters?.code,
      hasState: !!event.queryStringParameters?.state,
    });

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
      console.error("[mailchimp-auth-callback] Invalid state", e);
      throw new Error("Invalid state parameter");
    }

    console.log("[mailchimp-auth-callback] Starting token exchange", {
      hasCode: !!code,
      redirectUri: MAILCHIMP_REDIRECT_URI,
      userId: userId.substring(0, 8) + "...",
    });

    // 1) Exchange code for token
    const tokenRes = await fetch("https://login.mailchimp.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: MAILCHIMP_CLIENT_ID,
        client_secret: MAILCHIMP_CLIENT_SECRET,
        redirect_uri: MAILCHIMP_REDIRECT_URI,
        code,
      }).toString(),
    });

    const tokenText = await tokenRes.text();
    console.log("[mailchimp-auth-callback] Token response", {
      status: tokenRes.status,
      ok: tokenRes.ok,
      hasResponse: !!tokenText,
    });

    if (!tokenRes.ok) {
      throw new Error(
        `Mailchimp token exchange failed: ${tokenRes.status} - ${tokenText}`
      );
    }

    let tokenJson: any = {};
    try {
      tokenJson = JSON.parse(tokenText || "{}");
    } catch (e) {
      console.error("Failed to parse Mailchimp token JSON", e);
      throw new Error("Failed to parse Mailchimp token JSON");
    }

    const access_token = tokenJson.access_token as string;
    if (!access_token) {
      throw new Error("Missing access_token from Mailchimp response");
    }

    // 2) Metadata (dc / api endpoint)
    const metaRes = await fetch("https://login.mailchimp.com/oauth2/metadata", {
      headers: { Authorization: `OAuth ${access_token}` },
    });

    const metaText = await metaRes.text();
    console.log("[mailchimp-auth-callback] Metadata response", {
      status: metaRes.status,
      ok: metaRes.ok,
      hasResponse: !!metaText,
    });

    if (!metaRes.ok) {
      throw new Error(
        `Mailchimp metadata failed: ${metaRes.status} - ${metaText}`
      );
    }

    let meta: any = {};
    try {
      meta = JSON.parse(metaText || "{}");
    } catch (e) {
      console.error("Failed to parse Mailchimp metadata JSON", e);
      throw new Error("Failed to parse Mailchimp metadata JSON");
    }

    const dc = meta.dc ?? null;
    const api_endpoint = meta.api_endpoint ?? null;
    const now = new Date().toISOString();

    // 3) Hardened upsert into mailchimp_connections with verification
    console.log("[mailchimp-auth-callback] Attempting to save connection", {
      userId: userId.substring(0, 8) + "...",
      hasAccessToken: !!access_token,
      dataCenter: dc,
      apiEndpoint: api_endpoint,
    });

    const { data, error } = await supabase
      .from("mailchimp_connections")
      .upsert(
        {
          user_id: userId,
          access_token: access_token,
          data_center: dc,
          api_endpoint: api_endpoint,
          updated_at: now,
          // created_at will be set by default for new rows
        },
        {
          onConflict: "user_id",
        }
      )
      .select("id, user_id")
      .limit(1);

    // Verify the upsert succeeded before returning success
    if (error || !data || data.length === 0) {
      console.error("[mailchimp-auth-callback] Failed to upsert mailchimp_connections", {
        userId: userId.substring(0, 8) + "...",
        hasError: !!error,
        errorMessage: error?.message,
        dataLength: data?.length ?? 0,
      });

      // Treat as failure: redirect with error flag
      return {
        statusCode: 302,
        headers: {
          Location: "https://ghoste.one/dashboard/connected-accounts?mailchimp=error",
          "Cache-Control": "no-cache",
        },
        body: "",
      };
    }

    console.log("[mailchimp-auth-callback] Connection saved and verified", {
      userId: userId.substring(0, 8) + "...",
      connectionId: data[0].id,
      hasAccessToken: !!access_token,
      dataCenter: dc,
    });

    // Redirect back to Connected Accounts page with success flag
    return {
      statusCode: 302,
      headers: {
        Location: "https://ghoste.one/dashboard/connected-accounts?mailchimp=success",
        "Cache-Control": "no-cache",
      },
      body: "",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error: " + String(error);
    console.error("[mailchimp-auth-callback] Error during OAuth flow", message);

    // Redirect back to Connected Accounts page with error flag
    return {
      statusCode: 302,
      headers: {
        Location: "https://ghoste.one/dashboard/connected-accounts?mailchimp=error",
        "Cache-Control": "no-cache",
      },
      body: "",
    };
  }
};

export { handler };
