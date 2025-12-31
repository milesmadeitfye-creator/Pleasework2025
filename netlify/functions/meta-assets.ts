import type { Handler } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

const META_GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || 'v19.0';
const META_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

type AssetType = 'businesses' | 'pages' | 'instagram_accounts' | 'ad_accounts' | 'pixels';

interface FetchAssetsRequest {
  type: AssetType;
  business_id?: string;
  page_id?: string;
  ad_account_id?: string;
}

interface AssetItem {
  id: string;
  name: string;
  username?: string;
  instagram_business_account_id?: string;
  instagram_username?: string;
}

/**
 * Fetch Meta assets using the user's access token
 */
async function fetchMetaAssets(
  type: AssetType,
  accessToken: string,
  params: { business_id?: string; page_id?: string; ad_account_id?: string } = {}
): Promise<AssetItem[]> {
  let url: string;
  let fields: string;

  switch (type) {
    case 'businesses':
      // Get businesses the user has access to
      url = `${META_BASE_URL}/me/businesses`;
      fields = 'id,name';
      break;

    case 'pages':
      // Get pages - either from a business or from /me/accounts
      // CRITICAL: Also fetch instagram_business_account to get IG actor ID
      if (params.business_id) {
        url = `${META_BASE_URL}/${params.business_id}/owned_pages`;
      } else {
        url = `${META_BASE_URL}/me/accounts`;
      }
      fields = 'id,name,instagram_business_account{id,username}';
      break;

    case 'instagram_accounts':
      // Get Instagram accounts for a page
      if (!params.page_id) {
        throw new Error('page_id is required for instagram_accounts');
      }
      url = `${META_BASE_URL}/${params.page_id}`;
      fields = 'instagram_business_account{id,username,name}';
      break;

    case 'ad_accounts':
      // Get ad accounts - either from a business or from /me/adaccounts
      if (params.business_id) {
        url = `${META_BASE_URL}/${params.business_id}/owned_ad_accounts`;
      } else {
        url = `${META_BASE_URL}/me/adaccounts`;
      }
      fields = 'id,name,account_status';
      break;

    case 'pixels':
      // Get pixels for an ad account
      if (!params.ad_account_id) {
        throw new Error('ad_account_id is required for pixels');
      }
      // Ensure ad_account_id has act_ prefix
      const adAccountId = params.ad_account_id.startsWith('act_')
        ? params.ad_account_id
        : `act_${params.ad_account_id}`;
      url = `${META_BASE_URL}/${adAccountId}/adspixels`;
      fields = 'id,name';
      break;

    default:
      throw new Error(`Unknown asset type: ${type}`);
  }

  // Build request URL with fields and access token
  const requestUrl = new URL(url);
  requestUrl.searchParams.set('fields', fields);
  requestUrl.searchParams.set('access_token', accessToken);
  requestUrl.searchParams.set('limit', '100');

  console.log(`[meta-assets] Fetching ${type} from ${url}`);

  const response = await fetch(requestUrl.toString());
  const data: any = await response.json();

  // Check for OAuth 190 error (token invalid/expired)
  if (data.error) {
    const errorCode = data.error.code;
    const errorMessage = data.error.message || 'Unknown error';

    console.error(`[meta-assets] Meta API error:`, errorCode, errorMessage);

    // OAuth error 190: Token invalid/expired
    if (errorCode === 190 || errorMessage.includes('Error validating access token') || errorMessage.includes('session has been invalidated')) {
      const tokenInvalidError = new Error('NEEDS_RECONNECT');
      (tokenInvalidError as any).code = 'OAUTH_190';
      (tokenInvalidError as any).details = errorMessage;
      throw tokenInvalidError;
    }

    throw new Error(`Meta API error: ${errorCode} - ${errorMessage}`);
  }

  if (!response.ok) {
    throw new Error(`Meta API error: ${response.status}`);
  }

  // Handle different response structures
  let items: AssetItem[] = [];

  if (type === 'instagram_accounts') {
    // Instagram accounts are nested
    const igAccount = data.instagram_business_account;
    if (igAccount) {
      items = [
        {
          id: igAccount.id,
          name: igAccount.name || igAccount.username,
          username: igAccount.username,
        },
      ];
    }
  } else {
    // Most endpoints return { data: [...] }
    const rawItems = data.data || [];
    items = rawItems.map((item: any) => {
      const baseItem: AssetItem = {
        id: item.id,
        name: item.name,
      };

      // For pages, include Instagram business account info if available
      if (type === 'pages' && item.instagram_business_account) {
        baseItem.instagram_business_account_id = item.instagram_business_account.id;
        baseItem.instagram_username = item.instagram_business_account.username;
      }

      return baseItem;
    });
  }

  return items;
}

export const handler: Handler = async (event) => {
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
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Verify authentication
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing authorization header' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseAdmin();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[meta-assets] Auth verification failed', authError);
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid authorization token' }),
      };
    }

    // Get user's Meta credentials (canonical source)
    const { data: connection, error: connError } = await supabase
      .from('meta_credentials')
      .select('access_token, token_expires_at')
      .eq('user_id', user.id)
      .maybeSingle();

    // Safe debug logging
    const debugInfo = {
      row_found: !!connection,
      token_present: !!connection?.access_token,
      token_len: connection?.access_token?.length || 0,
      token_field: connection?.access_token ? 'access_token' : null,
    };
    console.log('[meta-assets] Connection debug:', debugInfo);

    if (connError) {
      console.error('[meta-assets] Database error', connError);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Failed to fetch Meta credentials' }),
      };
    }

    if (!connection || !connection.access_token) {
      console.warn('[meta-assets] No token found for user:', user.id);
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'NOT_CONNECTED',
          message: 'No Meta connection found. Please connect your Meta account.',
          debug: debugInfo,
        }),
      };
    }

    // Parse request body
    const body: FetchAssetsRequest = event.body ? JSON.parse(event.body) : {};

    if (!body.type) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required field: type' }),
      };
    }

    // Fetch assets from Meta API
    let items = await fetchMetaAssets(body.type, connection.access_token, {
      business_id: body.business_id,
      page_id: body.page_id,
      ad_account_id: body.ad_account_id,
    });

    // CRITICAL: Fallback for pages - if business-scoped returns empty, try me/accounts
    // This handles cases where:
    // 1. Business has no owned_pages
    // 2. User has pages but they're personal, not business-owned
    // 3. Business ID scope is too restrictive
    if (body.type === 'pages' && items.length === 0 && body.business_id) {
      console.log('[meta-assets] Business-scoped pages returned empty, falling back to /me/accounts');
      const fallbackItems = await fetchMetaAssets(body.type, connection.access_token, {});
      console.log(`[meta-assets] Fallback fetched ${fallbackItems.length} pages from /me/accounts`);
      items = fallbackItems;
    }

    console.log(`[meta-assets] Fetched ${items.length} ${body.type}`, {
      user_id: user.id,
      type: body.type,
      count: items.length,
      source: body.business_id && items.length > 0 ? 'business-scoped' : 'me/accounts',
      business_id_provided: !!body.business_id,
    });

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items,
        source: body.business_id && body.type !== 'pages' ? 'business' : 'me/accounts'
      }),
    };
  } catch (error: any) {
    console.error('[meta-assets] Error:', error);

    // Handle OAuth 190 error (token invalid)
    if (error.message === 'NEEDS_RECONNECT' || error.code === 'OAUTH_190') {
      console.log('[meta-assets] OAuth token invalid, clearing token and requiring reconnect');

      // Clear the invalid token from database
      const supabase = getSupabaseAdmin();
      const authHeader = event.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          await supabase
            .from('meta_credentials')
            .update({ access_token: null, token_expires_at: null })
            .eq('user_id', user.id);
        }
      }

      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'NEEDS_RECONNECT',
          message: 'Meta session invalidated. Please reconnect your Meta account.',
          details: error.details || error.message,
        }),
      };
    }

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: error.message || 'Internal server error',
      }),
    };
  }
};
