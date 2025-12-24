import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const MAILCHIMP_CLIENT_ID = process.env.MAILCHIMP_CLIENT_ID;
const MAILCHIMP_CLIENT_SECRET = process.env.MAILCHIMP_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.URL || 'https://ghoste.one'}/.netlify/functions/mailchimp-callback`;

export const handler: Handler = async (event) => {
  const { code, state, error: oauthError } = event.queryStringParameters || {};

  if (oauthError) {
    return {
      statusCode: 302,
      headers: {
        Location: `/dashboard?error=mailchimp_auth_failed`,
      },
    };
  }

  if (!code || !state) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing code or state" }),
    };
  }

  try {
    const { user_id } = JSON.parse(Buffer.from(state, 'base64').toString());

    const tokenResponse = await fetch('https://login.mailchimp.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: MAILCHIMP_CLIENT_ID!,
        client_secret: MAILCHIMP_CLIENT_SECRET!,
        code: code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokenData = await tokenResponse.json();

    const metadataResponse = await fetch('https://login.mailchimp.com/oauth2/metadata', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!metadataResponse.ok) {
      throw new Error('Failed to fetch Mailchimp metadata');
    }

    const metadata = await metadataResponse.json();

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);

    const { error: dbError } = await supabase
      .from('user_integrations')
      .upsert({
        user_id,
        platform: 'mailchimp',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        token_expires_at: expiresAt.toISOString(),
        mailchimp_dc: metadata.dc,
        server_prefix: metadata.dc,
        is_active: true,
      }, {
        onConflict: 'user_id,platform',
      });

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    return {
      statusCode: 302,
      headers: {
        Location: `/dashboard?mailchimp_connected=true`,
      },
    };
  } catch (err: any) {
    console.error('Mailchimp callback error:', err);
    return {
      statusCode: 302,
      headers: {
        Location: `/dashboard?error=mailchimp_connection_failed`,
      },
    };
  }
};
