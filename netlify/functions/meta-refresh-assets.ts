import { Handler, HandlerEvent } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { getUserMetaConfig, MetaConfigError } from './_metaUserConfig';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    // 1. Authenticate user
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing authorization header' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[meta-refresh-assets] User lookup failed:', userError);
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    console.log('[meta-refresh-assets] Refreshing assets for user:', user.id);

    // 2. Get user's Meta config (access token + assets)
    let metaConfig;
    try {
      metaConfig = await getUserMetaConfig(user.id);
    } catch (err) {
      if (err instanceof MetaConfigError) {
        console.error('[meta-refresh-assets]', err.code, err.message);

        // Only mark as truly disconnected for these specific cases
        const isActuallyDisconnected = [
          'META_NOT_CONNECTED',
          'META_TOKEN_MISSING',
        ].includes(err.code);

        if (isActuallyDisconnected) {
          return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'disconnected',
              error: err.code,
              message: err.message,
            }),
          };
        }

        // For incomplete config or database errors, return connected status with warning
        return {
          statusCode: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'connected',
            warning: 'refresh_failed',
            error: err.code,
            message: err.message,
            success: false,
          }),
        };
      }
      throw err;
    }

    const accessToken = metaConfig.accessToken;

    // 3. Fetch businesses
    console.log('[meta-refresh-assets] Fetching businesses...');
    const businessesUrl = `https://graph.facebook.com/v18.0/me/businesses?access_token=${accessToken}`;
    const businessesRes = await fetch(businessesUrl);
    const businessesData = await businessesRes.json();

    // Check for OAuth revocation errors (190, 102)
    if (businessesData.error) {
      console.error('[meta-refresh-assets] Error fetching businesses:', businessesData.error);

      const metaErrorCode = businessesData.error.code;
      const metaErrorType = businessesData.error.type;

      // OAuth token errors indicate true disconnection
      if (metaErrorCode === 190 || metaErrorCode === 102 || metaErrorType === 'OAuthException') {
        console.error('[meta-refresh-assets] OAuth error detected - user token is invalid/revoked');
        return {
          statusCode: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'disconnected',
            error: 'META_TOKEN_REVOKED',
            message: 'Meta access token has been revoked or expired. Please reconnect.',
          }),
        };
      }
    }

    const businesses = businessesData.data || [];
    console.log('[meta-refresh-assets] Found', businesses.length, 'businesses');

    // Store businesses
    if (businesses.length > 0) {
      for (const business of businesses) {
        await supabase.from('meta_businesses').upsert({
          user_id: user.id,
          business_id: business.id,
          name: business.name,
        }, { onConflict: 'user_id,business_id' });
      }
    }

    // 4. Fetch Facebook Pages
    console.log('[meta-refresh-assets] Fetching pages...');
    const pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token=${accessToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      console.error('[meta-refresh-assets] Error fetching pages:', pagesData.error);
    }

    const pages = pagesData.data || [];
    console.log('[meta-refresh-assets] Found', pages.length, 'pages');

    // Store pages
    if (pages.length > 0) {
      for (const page of pages) {
        await supabase.from('meta_pages').upsert({
          user_id: user.id,
          page_id: page.id,
          name: page.name,
          access_token: page.access_token || null,
        }, { onConflict: 'user_id,page_id' });
      }
    }

    // 5. Fetch Instagram profiles for each page
    console.log('[meta-refresh-assets] Fetching Instagram profiles...');
    let instagramProfiles = 0;

    for (const page of pages) {
      if (page.access_token) {
        try {
          const igUrl = `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`;
          const igRes = await fetch(igUrl);
          const igData = await igRes.json();

          if (igData.instagram_business_account) {
            const igId = igData.instagram_business_account.id;

            // Get IG username
            const igUserUrl = `https://graph.facebook.com/v18.0/${igId}?fields=username&access_token=${page.access_token}`;
            const igUserRes = await fetch(igUserUrl);
            const igUserData = await igUserRes.json();

            await supabase.from('meta_instagram_profiles').upsert({
              user_id: user.id,
              ig_user_id: igId,
              username: igUserData.username || null,
            }, { onConflict: 'user_id,ig_user_id' });

            instagramProfiles++;
          }
        } catch (err) {
          console.error('[meta-refresh-assets] Error fetching IG for page', page.id, err);
        }
      }
    }

    console.log('[meta-refresh-assets] Found', instagramProfiles, 'Instagram profiles');

    // 6. Fetch Ad Accounts
    console.log('[meta-refresh-assets] Fetching ad accounts...');
    const adAccountsUrl = `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,account_id,name,currency&access_token=${accessToken}`;
    const adAccountsRes = await fetch(adAccountsUrl);
    const adAccountsData = await adAccountsRes.json();

    if (adAccountsData.error) {
      console.error('[meta-refresh-assets] Error fetching ad accounts:', adAccountsData.error);
    }

    const adAccounts = adAccountsData.data || [];
    console.log('[meta-refresh-assets] Found', adAccounts.length, 'ad accounts');

    // Store ad accounts
    if (adAccounts.length > 0) {
      for (const adAccount of adAccounts) {
        await supabase.from('meta_ad_accounts').upsert({
          user_id: user.id,
          account_id: adAccount.account_id || adAccount.id,
          name: adAccount.name,
          currency: adAccount.currency || null,
        }, { onConflict: 'user_id,account_id' });
      }
    }

    // 7. Return counts
    const counts = {
      businesses: businesses.length,
      pages: pages.length,
      instagramProfiles,
      adAccounts: adAccounts.length,
    };

    console.log('[meta-refresh-assets] Refresh complete. Counts:', counts);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'connected',
        success: true,
        counts,
      }),
    };
  } catch (error: any) {
    console.error('[meta-refresh-assets] Fatal error:', error);

    // For unexpected errors during refresh, keep status as connected
    // but indicate the refresh failed
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'connected',
        success: false,
        warning: 'refresh_failed',
        error: 'REFRESH_ERROR',
        message: error?.message || 'Failed to refresh Meta assets. Your connection is still active.',
      }),
    };
  }
};
