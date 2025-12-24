import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin client with service role key (bypasses RLS)
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler: Handler = async (event) => {
  console.log('[meta-credentials] Request received');

  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        connected: false,
        error: 'METHOD_NOT_ALLOWED',
      }),
    };
  }

  try {
    // Get userId from query string
    const userId = event.queryStringParameters?.userId;

    if (!userId) {
      console.warn('[meta-credentials] Missing userId parameter');
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          connected: false,
          error: 'MISSING_USER_ID',
        }),
      };
    }

    console.log('[meta-credentials] Checking credentials for user:', userId.substring(0, 8) + '...');

    // Query meta_credentials table
    const { data, error } = await supabase
      .from('meta_credentials')
      .select(`
        user_id,
        access_token,
        meta_user_id,
        meta_user_name,
        business_id,
        ad_accounts,
        facebook_pages,
        instagram_accounts,
        pixels,
        ad_account_id,
        ad_account_name,
        facebook_page_id,
        facebook_page_name,
        instagram_id,
        instagram_username,
        pixel_id,
        pixel_name,
        is_active,
        configuration_complete,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .maybeSingle();

    // Handle database errors
    if (error) {
      console.error('[meta-credentials] Database error:', error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          connected: false,
          error: 'META_CREDENTIALS_SELECT_ERROR',
          details: error.message,
        }),
      };
    }

    // Check if credentials exist and are valid
    if (!data || !data.access_token || data.is_active === false) {
      console.log('[meta-credentials] No active credentials found for user');
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          connected: false,
        }),
      };
    }

    // Success - return connected status with credentials
    console.log('[meta-credentials] Active credentials found for user');
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        connected: true,
        credentials: {
          userId: data.user_id,
          metaUserId: data.meta_user_id,
          metaUserName: data.meta_user_name,
          accessToken: data.access_token,
          businessId: data.business_id,
          // Ad accounts
          adAccounts: data.ad_accounts || [],
          adAccountId: data.ad_account_id,
          adAccountName: data.ad_account_name,
          // Facebook pages
          pages: data.facebook_pages || [],
          pageId: data.facebook_page_id,
          pageName: data.facebook_page_name,
          // Instagram accounts
          instagramAccounts: data.instagram_accounts || [],
          instagramId: data.instagram_id,
          instagramUsername: data.instagram_username,
          // Pixels
          pixels: data.pixels || [],
          pixelId: data.pixel_id,
          pixelName: data.pixel_name,
          // Status
          isActive: data.is_active,
          configurationComplete: data.configuration_complete,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      }),
    };
  } catch (err: any) {
    console.error('[meta-credentials] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        connected: false,
        error: 'INTERNAL_ERROR',
        details: err?.message || String(err),
      }),
    };
  }
};
