import type { Handler } from '@netlify/functions';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    const { code, state, error, error_description } = event.queryStringParameters || {};

    // Handle OAuth errors
    if (error) {
      console.error('[meta-oauth-callback] OAuth error:', error, error_description);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: `
<!doctype html>
<html>
  <head>
    <title>Meta Connection Error</title>
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
      }
      .container {
        text-align: center;
        padding: 2rem;
      }
      .error {
        color: #f87171;
        font-size: 1.25rem;
        margin-bottom: 1rem;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="error">Meta connection failed</div>
      <div>${error_description || error}</div>
    </div>
    <script>
      (function() {
        var payload = {
          type: "META_OAUTH_ERROR",
          error: ${JSON.stringify(error_description || error)}
        };
        if (window.opener) {
          window.opener.postMessage(payload, "*");
          setTimeout(function() { window.close(); }, 2000);
        }
      })();
    </script>
  </body>
</html>
        `,
      };
    }

    // Validate required params
    if (!code || !state) {
      console.error('[meta-oauth-callback] Missing code or state');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Missing code or state parameter',
      };
    }

    // Get Meta app credentials from env
    const clientId = process.env.VITE_META_APP_ID;
    const clientSecret = process.env.META_APP_SECRET;
    const redirectUri = process.env.VITE_META_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('[meta-oauth-callback] Missing Meta env vars');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Meta environment variables are not configured',
      };
    }

    console.log('[meta-oauth-callback] Exchanging code for access token');

    // Exchange authorization code for access token
    const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl.toString());

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error('[meta-oauth-callback] Failed to exchange token:', errorText);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: `Failed to exchange authorization code: ${errorText}`,
      };
    }

    const tokenJson: any = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    const tokenType = tokenJson.token_type || 'bearer';
    const expiresIn = tokenJson.expires_in;

    if (!accessToken) {
      console.error('[meta-oauth-callback] No access token in response:', tokenJson);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: 'No access token received from Meta',
      };
    }

    console.log('[meta-oauth-callback] Token received, fetching user profile');

    // Fetch Meta user profile
    const meUrl = new URL('https://graph.facebook.com/v19.0/me');
    meUrl.searchParams.set('fields', 'id,name,email');
    meUrl.searchParams.set('access_token', accessToken);

    const meRes = await fetch(meUrl.toString());

    if (!meRes.ok) {
      const errorText = await meRes.text();
      console.error('[meta-oauth-callback] Failed to fetch user profile:', errorText);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: `Failed to fetch Meta user profile: ${errorText}`,
      };
    }

    const meJson: any = await meRes.json();

    // Calculate token expiration
    const expiresAt =
      typeof expiresIn === 'number'
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

    console.log('[meta-oauth-callback] Success! Meta user:', meJson.id);

    // Prepare payload to send back to frontend
    const payload = {
      type: 'META_OAUTH_SUCCESS',
      data: {
        state,
        meta_user_id: meJson.id,
        meta_name: meJson.name,
        meta_email: meJson.email,
        access_token: accessToken,
        token_type: tokenType,
        expires_at: expiresAt,
      },
    };

    // Return HTML that posts message back to opener window
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
<!doctype html>
<html>
  <head>
    <title>Connecting Meta Account</title>
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
      }
      .container {
        text-align: center;
        padding: 2rem;
      }
      .spinner {
        border: 3px solid rgba(59, 130, 246, 0.3);
        border-top: 3px solid #3b82f6;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        animation: spin 1s linear infinite;
        margin: 0 auto 1rem;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .success {
        color: #34d399;
        font-size: 1.25rem;
        margin-top: 1rem;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="spinner"></div>
      <div>Connecting your Meta account...</div>
      <div class="success" id="success" style="display: none;">✓ Connected successfully!</div>
    </div>
    <script>
      (function() {
        var payload = ${JSON.stringify(payload)};

        if (window.opener) {
          window.opener.postMessage(payload, "*");
          document.getElementById("success").style.display = "block";
          setTimeout(function() {
            window.close();
          }, 1500);
        } else {
          document.querySelector(".container").innerHTML =
            "<p>Connection successful! Please close this window and return to the app.</p>";
        }
      })();
    </script>
  </body>
</html>
      `,
    };
  } catch (err: any) {
    console.error('[meta-oauth-callback] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain' },
      body: `Server error: ${err.message || String(err)}`,
    };
  }
};
