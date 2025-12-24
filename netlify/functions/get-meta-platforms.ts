import { Handler, HandlerEvent } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Fetches available Meta platforms (businesses, pages, IG accounts, ad accounts)
 * without storing them. Used for displaying current options in the Meta wizard.
 */
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
        body: JSON.stringify({ error: 'MISSING_AUTH' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[get-meta-platforms] User lookup failed:', userError);
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'UNAUTHORIZED' }),
      };
    }

    console.log('[get-meta-platforms] Fetching platforms for user:', user.id);

    // 2. Check if user has Meta connection
    const { data: metaConn, error: connError } = await supabase
      .from('meta_connections')
      .select('access_token, meta_user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (connError || !metaConn || !metaConn.access_token) {
      console.error('[get-meta-platforms] No Meta connection found for user:', user.id);
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'META_NOT_CONNECTED' }),
      };
    }

    const accessToken = metaConn.access_token;

    // 3. Fetch businesses
    console.log('[get-meta-platforms] Fetching businesses...');
    let businesses: any[] = [];
    try {
      const businessesUrl = `https://graph.facebook.com/v18.0/me/businesses?access_token=${encodeURIComponent(accessToken)}`;
      const businessesRes = await fetch(businessesUrl);
      const businessesData = await businessesRes.json();

      if (businessesData.error) {
        console.error('[get-meta-platforms] Error fetching businesses:', businessesData.error);
      } else {
        businesses = businessesData.data || [];
        console.log('[get-meta-platforms] Found', businesses.length, 'businesses');
      }
    } catch (err) {
      console.error('[get-meta-platforms] Error fetching businesses:', err);
    }

    // 4. Fetch Facebook Pages
    console.log('[get-meta-platforms] Fetching pages...');
    let pages: any[] = [];
    try {
      const pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(accessToken)}`;
      const pagesRes = await fetch(pagesUrl);
      const pagesData = await pagesRes.json();

      if (pagesData.error) {
        console.error('[get-meta-platforms] Error fetching pages:', pagesData.error);
      } else {
        pages = pagesData.data || [];
        console.log('[get-meta-platforms] Found', pages.length, 'pages');
      }
    } catch (err) {
      console.error('[get-meta-platforms] Error fetching pages:', err);
    }

    // 5. Fetch Instagram accounts for each page
    console.log('[get-meta-platforms] Fetching Instagram accounts...');
    const instagramAccounts: any[] = [];

    for (const page of pages) {
      if (page.access_token) {
        try {
          const igUrl = `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.access_token)}`;
          const igRes = await fetch(igUrl);
          const igData = await igRes.json();

          if (igData.instagram_business_account) {
            const igId = igData.instagram_business_account.id;

            // Get IG username
            const igUserUrl = `https://graph.facebook.com/v18.0/${igId}?fields=username&access_token=${encodeURIComponent(page.access_token)}`;
            const igUserRes = await fetch(igUserUrl);
            const igUserData = await igUserRes.json();

            instagramAccounts.push({
              id: igId,
              username: igUserData.username || null,
              page_id: page.id,
              page_name: page.name,
            });
          }
        } catch (err) {
          console.error('[get-meta-platforms] Error fetching IG for page', page.id, err);
        }
      }
    }

    console.log('[get-meta-platforms] Found', instagramAccounts.length, 'Instagram accounts');

    // 6. Fetch Ad Accounts
    console.log('[get-meta-platforms] Fetching ad accounts...');
    let adAccounts: any[] = [];
    try {
      const adAccountsUrl = `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,account_id,name,currency,account_status&access_token=${encodeURIComponent(accessToken)}`;
      const adAccountsRes = await fetch(adAccountsUrl);
      const adAccountsData = await adAccountsRes.json();

      if (adAccountsData.error) {
        console.error('[get-meta-platforms] Error fetching ad accounts:', adAccountsData.error);
      } else {
        adAccounts = adAccountsData.data || [];
        console.log('[get-meta-platforms] Found', adAccounts.length, 'ad accounts');
      }
    } catch (err) {
      console.error('[get-meta-platforms] Error fetching ad accounts:', err);
    }

    // 7. Return platforms
    const platforms = {
      businesses,
      pages,
      instagramAccounts,
      adAccounts,
    };

    console.log('[get-meta-platforms] Returning platforms');

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(platforms),
    };
  } catch (error: any) {
    console.error('[get-meta-platforms] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'SERVER_ERROR',
        message: error?.message || 'Internal server error',
      }),
    };
  }
};
