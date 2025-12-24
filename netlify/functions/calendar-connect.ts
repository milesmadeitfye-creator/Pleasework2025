// netlify/functions/calendar-connect.ts
import type { Handler } from "@netlify/functions";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URL;

    if (!clientId) {
      throw new Error("GOOGLE_CLIENT_ID is not set in environment variables");
    }

    if (!redirectUri) {
      throw new Error("GOOGLE_OAUTH_REDIRECT_URL is not set in environment variables");
    }

    const scopes = [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ];

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: scopes.join(" "),
      include_granted_scopes: "true",
    });

    const authUrl = `${GOOGLE_AUTH_BASE}?${params.toString()}`;

    return {
      statusCode: 200,
      body: JSON.stringify({ url: authUrl }),
    };
  } catch (err: any) {
    console.error("calendar-connect error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || String(err),
      }),
    };
  }
};
