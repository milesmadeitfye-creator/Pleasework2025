import type { Handler } from "@netlify/functions";

const handler: Handler = async () => {
  const clientId = process.env.MAILCHIMP_CLIENT_ID || "";
  const clientSecret = process.env.MAILCHIMP_CLIENT_SECRET || "";
  const redirectUri = process.env.MAILCHIMP_REDIRECT_URI || "";

  const payload = {
    MAILCHIMP_CLIENT_ID_preview: clientId ? clientId.slice(0, 6) + "..." : null,
    MAILCHIMP_CLIENT_ID_length: clientId ? clientId.length : 0,
    MAILCHIMP_CLIENT_SECRET_length: clientSecret ? clientSecret.length : 0,
    MAILCHIMP_REDIRECT_URI: redirectUri || null,
  };

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload, null, 2),
  };
};

export { handler };
