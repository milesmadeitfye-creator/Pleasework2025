import { Handler, HandlerEvent } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      };
    }

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      };
    }

    console.log(`[meta-disconnect] Starting disconnect for user ${user.id}`);

    // Parse body to check for hard_reset flag
    let hardReset = false;
    try {
      const body = event.body ? JSON.parse(event.body) : {};
      hardReset = body.hard_reset === true;
    } catch (e) {
      // Ignore parse errors, proceed with normal disconnect
    }

    // Step 1: Fetch Meta access tokens BEFORE deleting (needed for API revocation)
    let metaAccessToken: string | null = null;

    // Try meta_credentials first (primary source)
    const { data: credentials } = await supabase
      .from('meta_credentials')
      .select('access_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (credentials?.access_token) {
      metaAccessToken = credentials.access_token;
    }

    // Fallback to user_meta_connections if not found
    if (!metaAccessToken) {
      const { data: connection } = await supabase
        .from('user_meta_connections')
        .select('access_token')
        .eq('user_id', user.id)
        .maybeSingle();

      if (connection?.access_token) {
        metaAccessToken = connection.access_token;
      }
    }

    console.log(`[meta-disconnect] Access token found: ${!!metaAccessToken}, hard_reset: ${hardReset}`);

    // Step 2: Revoke Meta permissions via Graph API (unless hard_reset mode)
    if (metaAccessToken && !hardReset) {
      try {
        const revokeUrl = `https://graph.facebook.com/v20.0/me/permissions?access_token=${encodeURIComponent(metaAccessToken)}`;
        const revokeResponse = await fetch(revokeUrl, {
          method: 'DELETE',
        });

        if (revokeResponse.ok) {
          const revokeData = await revokeResponse.json();
          console.log(`[meta-disconnect] Meta permissions revoked successfully:`, revokeData);
        } else {
          const errorText = await revokeResponse.text();
          console.warn(`[meta-disconnect] Meta API revoke failed (${revokeResponse.status}), continuing with local cleanup:`, errorText);
        }
      } catch (revokeError: any) {
        console.warn(`[meta-disconnect] Meta API revoke error (continuing with local cleanup):`, revokeError.message);
      }
    } else if (hardReset) {
      console.log(`[meta-disconnect] Skipping Meta API revoke (hard_reset mode)`);
    } else {
      console.log(`[meta-disconnect] No access token found, skipping Meta API revoke`);
    }

    // Step 3: Delete all Meta data from database
    const deletionResults: string[] = [];

    // 3a. Delete from meta_credentials
    const { error: credentialsError } = await supabase
      .from('meta_credentials')
      .delete()
      .eq('user_id', user.id);

    if (credentialsError) {
      console.error('[meta-disconnect] Error deleting meta_credentials:', credentialsError);
    } else {
      console.log(`[meta-disconnect] Deleted meta_credentials`);
      deletionResults.push('meta_credentials');
    }

    // 3b. Delete from user_meta_assets
    const { error: assetsError } = await supabase
      .from('user_meta_assets')
      .delete()
      .eq('user_id', user.id);

    if (assetsError) {
      console.error('[meta-disconnect] Error deleting user_meta_assets:', assetsError);
    } else {
      console.log(`[meta-disconnect] Deleted user_meta_assets`);
      deletionResults.push('user_meta_assets');
    }

    // 3c. Delete from user_meta_connections table
    const { error: deleteError } = await supabase
      .from('user_meta_connections')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('[meta-disconnect] Error deleting user_meta_connections:', deleteError);
    } else {
      console.log(`[meta-disconnect] Deleted user_meta_connections`);
      deletionResults.push('user_meta_connections');
    }

    // 3d. Delete from connected_accounts table
    const { error: connectedAccountsError } = await supabase
      .from('connected_accounts')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'meta');

    if (connectedAccountsError) {
      console.error('[meta-disconnect] Error deleting from connected_accounts:', connectedAccountsError);
    } else {
      console.log(`[meta-disconnect] Deleted connected_accounts`);
      deletionResults.push('connected_accounts');
    }

    // 3e. Delete from user_integrations table (used by get-integrations-status)
    const { error: integrationsError } = await supabase
      .from('user_integrations')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'meta');

    if (integrationsError) {
      console.error('[meta-disconnect] Error deleting from user_integrations:', integrationsError);
    } else {
      console.log(`[meta-disconnect] Deleted user_integrations`);
      deletionResults.push('user_integrations');
    }

    // 3f. Delete connected ad accounts
    const { error: adAccountsError } = await supabase
      .from('connected_ad_accounts')
      .delete()
      .eq('user_id', user.id);

    if (adAccountsError) {
      console.error('[meta-disconnect] Error deleting connected_ad_accounts:', adAccountsError);
    } else {
      console.log(`[meta-disconnect] Deleted connected_ad_accounts`);
      deletionResults.push('connected_ad_accounts');
    }

    // 3g. Delete Meta pages
    const { error: pagesError } = await supabase
      .from('meta_pages')
      .delete()
      .eq('user_id', user.id);

    if (pagesError) {
      console.error('[meta-disconnect] Error deleting meta_pages:', pagesError);
    } else {
      console.log(`[meta-disconnect] Deleted meta_pages`);
      deletionResults.push('meta_pages');
    }

    // 3h. Delete Meta Instagram accounts
    const { error: instagramError } = await supabase
      .from('meta_instagram_accounts')
      .delete()
      .eq('user_id', user.id);

    if (instagramError) {
      console.error('[meta-disconnect] Error deleting meta_instagram_accounts:', instagramError);
    } else {
      console.log(`[meta-disconnect] Deleted meta_instagram_accounts`);
      deletionResults.push('meta_instagram_accounts');
    }

    // 3i. Clear any Meta-related fields in user_profiles (if they exist)
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        meta_user_id: null,
        meta_user_name: null,
      })
      .eq('id', user.id);

    if (profileError) {
      console.error('[meta-disconnect] Error clearing profile Meta fields:', profileError);
    } else {
      console.log(`[meta-disconnect] Cleared profile Meta fields`);
      deletionResults.push('user_profiles (cleared)');
    }

    console.log(`[meta-disconnect] Successfully disconnected Meta for user ${user.id}`);
    console.log(`[meta-disconnect] Cleared tables: ${deletionResults.join(', ')}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Meta account disconnected successfully',
        cleared_tables: deletionResults,
        revoked_permissions: !hardReset && !!metaAccessToken,
      }),
    };
  } catch (error: any) {
    console.error('[meta-disconnect] Unexpected error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to disconnect Meta account',
        details: error?.message || String(error),
      }),
    };
  }
};

export { handler };
