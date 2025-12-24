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

    // Check meta_credentials table (primary source of truth for posting)
    const { data: credentials, error: credError } = await supabase
      .from('meta_credentials')
      .select('access_token, meta_user_id, meta_user_name, facebook_page_id, facebook_page_name, instagram_id, instagram_username, ad_account_id, ad_account_name, business_id, page_posting_enabled, instagram_posting_enabled, default_page_id, default_instagram_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (credError || !credentials || !credentials.access_token) {
      // Fallback to old tables for backward compatibility
      const { data: connection, error: dbError } = await supabase
        .from('user_meta_connections')
        .select('access_token, meta_user_id, meta_user_name, expires_at, ad_accounts, business_accounts, pixels, selected_pixel_id, connected_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (dbError || !connection || !connection.access_token) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connected: false }),
        };
      }

      // Check if token is expired
      if (connection.expires_at) {
        const now = new Date();
        const expiresAt = new Date(connection.expires_at);
        const isExpired = expiresAt < now;

        if (isExpired) {
          await supabase
            .from('user_meta_connections')
            .delete()
            .eq('user_id', user.id);

          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connected: false }),
          };
        }
      }

      // Check Meta assets
      const { data: assets } = await supabase
        .from('user_meta_assets')
        .select('business_id, page_id, instagram_id, ad_account_id, pixel_id, business_name, page_name, instagram_username, ad_account_name')
        .eq('user_id', user.id)
        .maybeSingle();

      // Determine if setup is complete
      const hasRequiredAssets = !!(
        assets?.business_id &&
        assets?.page_id &&
        assets?.instagram_id &&
        assets?.ad_account_id
      );

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connected: hasRequiredAssets,
          metaUserId: connection.meta_user_id,
          metaUserName: connection.meta_user_name,
          expiresAt: connection.expires_at,
          adAccounts: connection.ad_accounts || [],
          businessAccounts: connection.business_accounts || [],
          pixels: connection.pixels || [],
          selectedPixelId: connection.selected_pixel_id,
          connectedAt: connection.connected_at,
          businessId: assets?.business_id,
          pageId: assets?.page_id,
          instagramId: assets?.instagram_id,
          adAccountId: assets?.ad_account_id,
          pixelId: assets?.pixel_id,
          businessName: assets?.business_name,
          pageName: assets?.page_name,
          instagramUsername: assets?.instagram_username,
          adAccountName: assets?.ad_account_name,
        }),
      };
    }

    // Using meta_credentials (new architecture)
    const pageId = credentials.default_page_id || credentials.facebook_page_id;
    const instagramId = credentials.default_instagram_id || credentials.instagram_id;
    const canPostFB = !!pageId && (credentials.page_posting_enabled !== false);
    const canPostIG = !!instagramId && (credentials.instagram_posting_enabled !== false);
    const connected = !!credentials.access_token;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connected,
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
