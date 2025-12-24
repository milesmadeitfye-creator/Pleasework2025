import type { Handler } from "@netlify/functions";

const MAILCHIMP_CLIENT_ID = process.env.MAILCHIMP_CLIENT_ID!;
const MAILCHIMP_REDIRECT_URI = process.env.MAILCHIMP_REDIRECT_URI!;

if (!MAILCHIMP_CLIENT_ID || !MAILCHIMP_REDIRECT_URI) {
  console.error("[mailchimp-auth-start] Missing env vars", {
    hasClientId: !!MAILCHIMP_CLIENT_ID,
    hasRedirectUri: !!MAILCHIMP_REDIRECT_URI,
  });
}

const handler: Handler = async (event) => {
  try {
    const { user_id } = event.queryStringParameters ?? {};
    if (!user_id) {
      console.error("mailchimp-auth-start: missing user_id");
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: "Missing user_id" }),
      };
    }

    if (!MAILCHIMP_CLIENT_ID || !MAILCHIMP_REDIRECT_URI) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: "Mailchimp env vars not configured on server",
        }),
      };
    }

    const state = encodeURIComponent(JSON.stringify({ user_id }));

    const authUrl = new URL("https://login.mailchimp.com/oauth2/authorize");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", MAILCHIMP_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", MAILCHIMP_REDIRECT_URI);
    authUrl.searchParams.set("state", state);

    console.log("[mailchimp-auth-start] Redirecting to Mailchimp", {
      hasUserId: !!user_id,
      redirectUri: MAILCHIMP_REDIRECT_URI,
      authUrl: authUrl.origin + authUrl.pathname,
    });

    return {
      statusCode: 302,
      headers: { Location: authUrl.toString() },
      body: "",
    };
  } catch (error) {
    console.error("[mailchimp-auth-start] Error", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};

export { handler };
