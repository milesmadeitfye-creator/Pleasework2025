import type { Handler } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connected: false }),
      };
    }

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connected: false }),
      };
    }

    // Check meta_credentials table (SINGLE SOURCE OF TRUTH)
    const { data: credentials, error: credError } = await supabase
      .from('meta_credentials')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credError) {
      console.error('[meta-connection-status] Query error:', credError);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connected: false, error: 'Query failed' }),
      };
    }

    if (!credentials || !credentials.access_token) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connected: false }),
      };
    }

    // Check if token expired
    if (credentials.expires_at) {
      const now = new Date();
      const expiresAt = new Date(credentials.expires_at);
      const isExpired = expiresAt < now;

      if (isExpired) {
        console.log('[meta-connection-status] Token expired for user:', user.id);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connected: false, expired: true }),
        };
      }
    }

    // Connected with valid token
    const pageId = credentials.default_page_id || credentials.facebook_page_id || credentials.page_id;
    const instagramId = credentials.default_instagram_id || credentials.instagram_account_id || credentials.instagram_id;
    const canPostFB = !!pageId && (credentials.page_posting_enabled !== false);
    const canPostIG = !!instagramId && (credentials.instagram_posting_enabled !== false);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connected: true,
        canPostFB,
        canPostIG,
        metaUserId: credentials.meta_user_id,
        metaUserName: credentials.meta_user_name,
        businessId: credentials.business_id,
        adAccountId: credentials.ad_account_id,
        adAccountName: credentials.ad_account_name,
        pageId,
        pageName: credentials.facebook_page_name,
        instagramId,
        instagramUsername: credentials.instagram_username,
        pixelId: credentials.pixel_id,
        pagePostingEnabled: credentials.page_posting_enabled,
        instagramPostingEnabled: credentials.instagram_posting_enabled,
      }),
    };
  } catch (error) {
    console.error('Meta connection status error:', error);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connected: false }),
    };
  }
};
