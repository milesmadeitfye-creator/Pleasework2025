import type { Handler } from "@netlify/functions";

const META_APP_ID = process.env.META_APP_ID!;
const META_REDIRECT_URI = process.env.META_REDIRECT_URI!; // https://ghoste.one/.netlify/functions/meta-auth-callback

// Centralized scope list - includes ads_management, ads_read, business_management
const META_REQUIRED_SCOPES = [
  'public_profile',
  'email',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'ads_read',
  'ads_management',
  'business_management',
  'read_insights',
];

const handler: Handler = async (event) => {
  try {
    const { user_id } = event.queryStringParameters ?? {};

    if (!user_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: "Missing user_id" }),
      };
    }

    const state = encodeURIComponent(JSON.stringify({ user_id }));

    const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    authUrl.searchParams.set("client_id", META_APP_ID);
    authUrl.searchParams.set("redirect_uri", META_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", META_REQUIRED_SCOPES.join(','));
    authUrl.searchParams.set("state", state);
    // Force rerequest to show permission prompt again
    authUrl.searchParams.set("auth_type", "rerequest");

    console.log('[meta-auth-start] Generating OAuth URL:', {
      user_id: user_id,
      scopes: META_REQUIRED_SCOPES,
      includes_ads_management: META_REQUIRED_SCOPES.includes('ads_management'),
      includes_ads_read: META_REQUIRED_SCOPES.includes('ads_read'),
      includes_business_management: META_REQUIRED_SCOPES.includes('business_management'),
      redirect_uri: META_REDIRECT_URI,
    });

    console.log('[meta-auth-start] Redirecting to:', authUrl.toString());

    return {
      statusCode: 302,
      headers: { Location: authUrl.toString() },
      body: "",
    };
  } catch (error) {
    console.error("meta-auth-start error", error);
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
