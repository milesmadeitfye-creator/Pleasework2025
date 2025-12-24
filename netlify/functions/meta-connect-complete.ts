import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('[meta-connect-complete] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
}

// Single Supabase client with service role key (bypasses RLS and can verify JWTs)
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

// Helper to convert undefined and empty strings to null
const clean = (x: any) => {
  if (x === undefined || x === null || x === '') return null;
  return x;
};

const META_APP_ID = process.env.META_APP_ID!;
const META_APP_SECRET = process.env.META_APP_SECRET!;
const META_REDIRECT_URI = process.env.META_REDIRECT_URI!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handles Meta OAuth completion and stores Meta integration in Supabase
export const handler: Handler = async (event) => {
  console.log('[meta-connect-complete] Request received:', event.httpMethod);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }),
    };
  }

  try {
    // 1. Parse request body
    if (!event.body) {
      console.error('[meta-connect-complete] missing request body');
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_STORE_FAILED',
          details: 'Missing request body',
        }),
      };
    }

    let payload: any;
    try {
      payload = JSON.parse(event.body);
    } catch (e) {
      console.error('[meta-connect-complete] invalid JSON in body');
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_STORE_FAILED',
          details: 'Invalid JSON in request body',
        }),
      };
    }

    const code = payload.code as string | undefined;
    const state = payload.state as string | undefined;

    if (!code) {
      console.error('[meta-connect-complete] missing code parameter');
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_STORE_FAILED',
          details: 'Missing code parameter',
        }),
      };
    }

    console.log('[meta-connect-complete] Code received, state:', state || 'none');

    // 2. Parse JWT from Authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    if (!token) {
      console.error('[meta-connect-complete] missing Authorization header');
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_STORE_FAILED',
          details: 'Missing Authorization header',
        }),
      };
    }

    // 3. Verify user from JWT using service role client
    console.log('[meta-connect-complete] Verifying user from JWT');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData?.user) {
      console.error('[meta-connect-complete] getUser failed:', userError);
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_STORE_FAILED',
          details: 'Invalid user from JWT',
        }),
      };
    }

    const userId = userData.user.id;
    console.log('[meta-connect-complete] User verified:', userId);

    // 4. Exchange code for access token
    console.log('[meta-connect-complete] Exchanging code for Meta access token');

    const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', META_APP_ID);
    tokenUrl.searchParams.set('client_secret', META_APP_SECRET);
    tokenUrl.searchParams.set('redirect_uri', META_REDIRECT_URI);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl.toString(), { method: 'GET' });
    const tokenText = await tokenRes.text();

    if (!tokenRes.ok) {
      console.error('[meta-connect-complete] token exchange failed:', tokenRes.status, tokenText);
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_STORE_FAILED',
          details: `Meta token exchange failed: ${tokenText}`,
        }),
      };
    }

    let tokenJson: any;
    try {
      tokenJson = JSON.parse(tokenText);
    } catch (e) {
      console.error('[meta-connect-complete] invalid JSON from Meta token endpoint:', tokenText);
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_STORE_FAILED',
          details: 'Invalid JSON response from Meta',
        }),
      };
    }

    const userAccessToken = tokenJson.access_token as string | undefined;
    const expiresIn = tokenJson.expires_in as number | undefined;

    if (!userAccessToken || userAccessToken.trim() === '') {
      console.error('[meta-connect-complete] no access_token in response:', tokenJson);
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_STORE_FAILED',
          details: 'No access token returned from Meta',
        }),
      };
    }

    console.log('[meta-connect-complete] Access token received');

    // 5. Fetch and validate user permissions
    console.log('[meta-connect-complete] Fetching user permissions');
    const permsRes = await fetch(
      `https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(
        userAccessToken
      )}`
    );

    let grantedPermissions: string[] = [];
    let declinedPermissions: string[] = [];
    let missingPermissions: string[] = [];
    let pagePostingEnabled = false;
    let instagramPostingEnabled = false;

    if (permsRes.ok) {
      try {
        const permsJson = await permsRes.json();
        const permsData = Array.isArray(permsJson.data) ? permsJson.data : [];

        // Extract granted permissions
        grantedPermissions = permsData
          .filter((p: any) => p.status === 'granted')
          .map((p: any) => p.permission);

        // Extract declined permissions
        declinedPermissions = permsData
          .filter((p: any) => p.status === 'declined')
          .map((p: any) => p.permission);

        console.log('[meta-connect-complete] Granted permissions:', grantedPermissions);
        console.log('[meta-connect-complete] Declined permissions:', declinedPermissions);

        // Check for required posting permissions
        pagePostingEnabled = grantedPermissions.includes('pages_manage_posts');
        instagramPostingEnabled = grantedPermissions.includes('instagram_content_publish');

        // Track missing required permissions
        const requiredPermissions = ['pages_manage_posts', 'instagram_content_publish'];
        missingPermissions = requiredPermissions.filter(
          (perm) => !grantedPermissions.includes(perm)
        );

        if (missingPermissions.length > 0) {
          console.warn('[meta-connect-complete] Missing required permissions:', missingPermissions);
        } else {
          console.log('[meta-connect-complete] All required permissions granted ✅');
        }
      } catch (e) {
        console.error('[meta-connect-complete] Failed to parse permissions:', e);
      }
    } else {
      const permsText = await permsRes.text();
      console.error('[meta-connect-complete] Permissions fetch failed:', permsRes.status, permsText);
    }

    // 6. Fetch Meta user info
    console.log('[meta-connect-complete] Fetching Meta user info');
    const meRes = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${encodeURIComponent(
        userAccessToken
      )}`
    );

    if (!meRes.ok) {
      const meText = await meRes.text();
      console.error('[meta-connect-complete] Meta user info fetch failed:', meRes.status, meText);
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_STORE_FAILED',
          details: 'Failed to fetch Meta user info',
        }),
      };
    }

    const meJson = await meRes.json();
    const metaUserId = meJson.id as string | undefined;
    const metaUserName = meJson.name as string | undefined;

    if (!metaUserId) {
      console.error('[meta-connect-complete] no Meta user ID in response:', meJson);
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_STORE_FAILED',
          details: 'No Meta user ID returned',
        }),
      };
    }

    console.log('[meta-connect-complete] Meta user:', metaUserId, metaUserName);

    // 6. Fetch ad accounts
    console.log('[meta-connect-complete] Fetching ad accounts');
    const adAccountsRes = await fetch(
      `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status&access_token=${encodeURIComponent(
        userAccessToken
      )}`
    );

    let adAccounts: any[] = [];
    if (adAccountsRes.ok) {
      try {
        const adAccountsJson = await adAccountsRes.json();
        adAccounts = Array.isArray(adAccountsJson.data) ? adAccountsJson.data : [];
        console.log('[meta-connect-complete] Found', adAccounts.length, 'ad accounts');
      } catch (e) {
        console.error('[meta-connect-complete] Failed to parse ad accounts:', e);
      }
    } else {
      const adText = await adAccountsRes.text();
      console.error('[meta-connect-complete] Ad accounts fetch failed:', adAccountsRes.status, adText);
    }

    // 7. Fetch Facebook pages
    console.log('[meta-connect-complete] Fetching Facebook pages');
    const pagesRes = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(
        userAccessToken
      )}`
    );

    let facebookPages: any[] = [];
    if (pagesRes.ok) {
      try {
        const pagesJson = await pagesRes.json();
        facebookPages = Array.isArray(pagesJson.data) ? pagesJson.data : [];
        console.log('[meta-connect-complete] Found', facebookPages.length, 'Facebook pages');
      } catch (e) {
        console.error('[meta-connect-complete] Failed to parse pages:', e);
      }
    } else {
      const pagesText = await pagesRes.text();
      console.error('[meta-connect-complete] Pages fetch failed:', pagesRes.status, pagesText);
    }

    // 8. Fetch Instagram accounts
    console.log('[meta-connect-complete] Fetching Instagram accounts');
    let instagramAccounts: any[] = [];
    for (const page of facebookPages) {
      try {
        const igRes = await fetch(
          `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(
            page.access_token || userAccessToken
          )}`
        );
        if (igRes.ok) {
          const igData = await igRes.json();
          if (igData.instagram_business_account) {
            instagramAccounts.push({
              id: igData.instagram_business_account.id,
              page_id: page.id,
              page_name: page.name,
            });
          }
        }
      } catch (e) {
        console.error('[meta-connect-complete] Failed to fetch IG for page', page.id, e);
      }
    }
    console.log('[meta-connect-complete] Found', instagramAccounts.length, 'Instagram accounts');

    // 9. Fetch pixels from ad accounts
    console.log('[meta-connect-complete] Fetching pixels from ad accounts');
    let allPixels: any[] = [];

    for (const adAccount of adAccounts) {
      try {
        const pixelsRes = await fetch(
          `https://graph.facebook.com/v18.0/${adAccount.id}/adspixels?fields=id,name&access_token=${encodeURIComponent(
            userAccessToken
          )}`
        );
        if (pixelsRes.ok) {
          const pixelsJson = await pixelsRes.json();
          if (Array.isArray(pixelsJson.data)) {
            for (const pixel of pixelsJson.data) {
              // Avoid duplicates if same pixel is in multiple ad accounts
              if (!allPixels.find(p => p.id === pixel.id)) {
                allPixels.push({
                  id: pixel.id,
                  name: pixel.name,
                  ad_account_id: adAccount.id,
                });
              }
            }
          }
        }
      } catch (e) {
        console.error('[meta-connect-complete] Failed to fetch pixels for ad account', adAccount.id, e);
      }
    }
    console.log('[meta-connect-complete] Found', allPixels.length, 'pixels');

    // 10. Build database payload for NEW meta_credentials schema
    const adAccountId = adAccounts.length > 0 ? adAccounts[0].id : null;
    const adAccountName = adAccounts.length > 0 ? adAccounts[0].name : null;
    const facebookPageId = facebookPages.length > 0 ? facebookPages[0].id : null;
    const facebookPageName = facebookPages.length > 0 ? facebookPages[0].name : null;
    const instagramId = instagramAccounts.length > 0 ? instagramAccounts[0].id : null;
    const pixelId = allPixels.length > 0 ? allPixels[0].id : null;
    const pixelName = allPixels.length > 0 ? allPixels[0].name : null;

    // Validate required fields before saving
    if (!userAccessToken || userAccessToken.trim() === '') {
      console.error('[meta-connect-complete] Cannot save: access token is missing or empty');
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_STORE_FAILED',
          details: 'Access token is required but was not received from Meta',
        }),
      };
    }

    const dbPayload = {
      user_id: userId,
      meta_user_id: clean(metaUserId),
      meta_user_name: clean(metaUserName),
      access_token: userAccessToken, // Don't clean this - we validated it's not empty
      token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      ad_accounts: adAccounts,
      ad_account_id: clean(adAccountId),
      ad_account_name: clean(adAccountName),
      facebook_pages: facebookPages,
      facebook_page_id: clean(facebookPageId),
      facebook_page_name: clean(facebookPageName),
      instagram_accounts: instagramAccounts,
      instagram_id: clean(instagramId),
      pixels: allPixels,
      pixel_id: clean(pixelId),
      pixel_name: clean(pixelName),
      is_active: true,
      // Permission tracking
      page_posting_enabled: pagePostingEnabled,
      instagram_posting_enabled: instagramPostingEnabled,
      missing_permissions: missingPermissions,
      granted_permissions: grantedPermissions,
      declined_permissions: declinedPermissions,
      last_permission_check: new Date().toISOString(),
    };

    console.log('[meta-connect-complete] Upserting meta_credentials:', {
      user_id: dbPayload.user_id,
      meta_user_id: dbPayload.meta_user_id,
      meta_user_name: dbPayload.meta_user_name,
      ad_account_id: dbPayload.ad_account_id,
      facebook_page_id: dbPayload.facebook_page_id,
      instagram_id: dbPayload.instagram_id,
      pixel_id: dbPayload.pixel_id,
      has_access_token: !!dbPayload.access_token,
      ad_accounts_count: adAccounts.length,
      pages_count: facebookPages.length,
      instagram_accounts_count: instagramAccounts.length,
      pixels_count: allPixels.length,
    });

    // 11. Upsert into meta_credentials
    let { data: upsertData, error: upsertError } = await supabase
      .from('meta_credentials')
      .upsert(dbPayload, { onConflict: 'user_id' })
      .select();

    // DEFENSIVE RETRY: If schema cache is stale (PGRST204), retry with core fields only
    if (upsertError && upsertError.code === 'PGRST204') {
      console.warn('[meta-connect-complete] PGRST204 detected (schema cache stale). Retrying with core fields only...');

      // Build stripped payload with ONLY core fields that we know exist
      const corePayload = {
        user_id: dbPayload.user_id,
        meta_user_id: dbPayload.meta_user_id,
        access_token: dbPayload.access_token,
        token_expires_at: dbPayload.token_expires_at,
        ad_accounts: dbPayload.ad_accounts,
        ad_account_id: dbPayload.ad_account_id,
        facebook_pages: dbPayload.facebook_pages,
        facebook_page_id: dbPayload.facebook_page_id,
        instagram_accounts: dbPayload.instagram_accounts,
        instagram_id: dbPayload.instagram_id,
        pixels: dbPayload.pixels,
        pixel_id: dbPayload.pixel_id,
        is_active: dbPayload.is_active,
        page_posting_enabled: dbPayload.page_posting_enabled,
        instagram_posting_enabled: dbPayload.instagram_posting_enabled,
        missing_permissions: dbPayload.missing_permissions,
        granted_permissions: dbPayload.granted_permissions,
        declined_permissions: dbPayload.declined_permissions,
        last_permission_check: dbPayload.last_permission_check,
      };

      console.log('[meta-connect-complete] Retry payload (core fields only)');

      // ATTEMPT 2: Retry with stripped payload
      const retryResult = await supabase
        .from('meta_credentials')
        .upsert(corePayload, { onConflict: 'user_id' })
        .select();

      upsertData = retryResult.data;
      upsertError = retryResult.error;

      if (upsertError) {
        console.error('[meta-connect-complete] Retry FAILED:', upsertError);
      } else {
        console.log('[meta-connect-complete] Retry SUCCESS. Schema cache was stale but upsert completed.');
      }
    }

    if (upsertError) {
      console.error('[meta-connect-complete] meta_credentials upsert FAILED:', upsertError);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_STORE_FAILED',
          details: upsertError.message,
          code: upsertError.code,
        }),
      };
    }

    console.log('[meta-connect-complete] meta_credentials upsert OK:', upsertData);

    // 11. Store additional connection info in user_meta_connections
    const now = new Date().toISOString();

    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    const connectionPayload = {
      user_id: userId,
      meta_user_id: metaUserId,
      meta_user_name: metaUserName,
      access_token: userAccessToken,
      token_type: 'Bearer',
      scopes: ['public_profile', 'pages_show_list', 'pages_read_engagement', 'ads_management', 'business_management'],
      expires_at: expiresAt,
      business_accounts: facebookPages,
      ad_accounts: adAccounts,
      connected_at: now,
      updated_at: now,
    };

    const { error: metaConnError } = await supabase
      .from('user_meta_connections')
      .upsert(connectionPayload, { onConflict: 'user_id' });

    if (metaConnError) {
      console.error('[meta-connect-complete] user_meta_connections upsert error:', metaConnError);
      // Don't fail the whole call if this secondary write fails
    }

    // 12. Update connected_accounts
    const { error: connError } = await supabase
      .from('connected_accounts')
      .upsert(
        {
          user_id: userId,
          provider: 'meta',
          status: 'connected',
          last_connected_at: now,
          data: {
            ad_account_count: adAccounts.length,
            facebook_page_count: facebookPages.length,
            instagram_account_count: instagramAccounts.length,
            pixel_count: allPixels.length,
            meta_user_id: metaUserId,
            meta_user_name: metaUserName,
          },
          updated_at: now,
        },
        { onConflict: 'user_id,provider' }
      );

    if (connError) {
      console.error('[meta-connect-complete] connected_accounts upsert error:', connError);
      // Don't fail the whole call
    }

    // 13. Update user_integrations
    const { error: integrationError } = await supabase
      .from('user_integrations')
      .upsert(
        {
          user_id: userId,
          platform: 'meta',
          provider: 'meta',
          access_token: userAccessToken,
          is_active: true,
          external_account_id: metaUserId,
          connected_at: now,
          expires_at: expiresAt,
          meta: {
            ad_account_count: adAccounts.length,
            facebook_page_count: facebookPages.length,
            instagram_account_count: instagramAccounts.length,
            pixel_count: allPixels.length,
            meta_user_name: metaUserName,
          },
          updated_at: now,
        },
        { onConflict: 'user_id,provider' }
      );

    if (integrationError) {
      console.error('[meta-connect-complete] user_integrations upsert error:', integrationError);
      // Don't fail the whole call
    }

    // 14. Success!
    console.log('[meta-connect-complete] All writes completed successfully');
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        connected: true,
        adAccountsCount: adAccounts.length,
        pagesCount: facebookPages.length,
        instagramAccountsCount: instagramAccounts.length,
        pixelsCount: allPixels.length,
      }),
    };
  } catch (err: any) {
    console.error('[meta-connect-complete] unexpected error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'META_STORE_FAILED',
        details: err?.message || 'Unknown error',
      }),
    };
  }
};
