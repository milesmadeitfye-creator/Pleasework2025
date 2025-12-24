import type { Handler } from "@netlify/functions";

const MAILCHIMP_CLIENT_ID = process.env.MAILCHIMP_CLIENT_ID;
const MAILCHIMP_CLIENT_SECRET = process.env.MAILCHIMP_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.URL || 'https://ghoste.one'}/.netlify/functions/mailchimp-callback`;

export const handler: Handler = async (event) => {
  const { user_id } = event.queryStringParameters || {};

  if (!user_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing user_id" }),
    };
  }

  if (!MAILCHIMP_CLIENT_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Mailchimp OAuth not configured" }),
    };
  }

  const state = Buffer.from(JSON.stringify({ user_id })).toString('base64');

  const authUrl = new URL('https://login.mailchimp.com/oauth2/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', MAILCHIMP_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('state', state);

  return {
    statusCode: 302,
    headers: {
      Location: authUrl.toString(),
    },
  };
};
