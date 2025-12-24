import type { Handler } from "@netlify/functions";
import { createHmac } from "crypto";

export const handler: Handler = async (event) => {
  console.log("[meta-auth] OAuth flow initiated", {
    method: event.httpMethod,
    hasUserId: !!event.queryStringParameters?.userId,
  });

  try {
    const META_APP_ID = process.env.META_APP_ID!;
    const META_REDIRECT_URI = process.env.META_REDIRECT_URI!;
    const META_SESSION_SECRET = process.env.META_SESSION_SECRET || "ghoste_meta_secret_key_2024";

    const userId =
      event.queryStringParameters?.userId ||
      event.queryStringParameters?.uid ||
      "";

    if (!userId) {
      console.error("[meta-auth] Missing userId parameter");
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "MISSING_USER_ID" }),
      };
    }

    // Include redirect path in state (default to dashboard accounts tab)
    const redirectPath = event.queryStringParameters?.redirectPath || "/dashboard?tab=accounts";

    // Create signed state token
    const payload = {
      userId,
      redirectPath,
      ts: Date.now(),
    };
    const json = JSON.stringify(payload);
    const base = Buffer.from(json).toString("base64url");
    const sig = createHmac("sha256", META_SESSION_SECRET).update(base).digest("base64url");
    const state = `${base}.${sig}`;

    // Request necessary permissions for ads and pages management
    const scopes = [
      "public_profile",
      "pages_show_list",
      "pages_read_engagement",
      "business_management",
      "ads_management",
      "ads_read"
    ];

    const url = new URL("https://www.facebook.com/v22.0/dialog/oauth");
    url.searchParams.set("client_id", META_APP_ID);
    url.searchParams.set("redirect_uri", META_REDIRECT_URI);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(","));

    console.log("[meta-auth] Redirect generated", {
      userId,
      redirectUri: META_REDIRECT_URI,
      scopes: scopes.join(","),
      facebookUrl: url.origin + url.pathname
    });

    return {
      statusCode: 302,
      headers: {
        Location: url.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
      body: "",
    };
  } catch (err: any) {
    console.error("[meta-auth] Fatal error", {
      message: err.message,
      stack: err.stack,
    });
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "META_AUTH_INIT_FAILED", message: err.message }),
    };
  }
};
