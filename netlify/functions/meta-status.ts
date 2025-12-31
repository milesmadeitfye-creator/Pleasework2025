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
  'Content-Type': 'application/json',
};

function normalizeAdAccountId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('act_')) return trimmed;
  if (/^\d+$/.test(trimmed)) return `act_${trimmed}`;
  return trimmed;
}

async function validateMetaToken(accessToken: string): Promise<{ valid: boolean; error?: any }> {
  try {
    const res = await fetch('https://graph.facebook.com/v20.0/me?fields=id', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const error = await res.json();
      return { valid: false, error };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: err };
  }
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const functionName = 'meta-status';

  try {
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      console.log(`[${functionName}] Missing authorization header`);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          auth_connected: false,
          assets_configured: false,
          ready_to_run_ads: false,
          missing_required: ['authentication'],
          optional: { pixel_set: false, instagram_set: false },
          checkmarks: {
            step1_auth: false,
            step2_ad_account: false,
            step3_page: false,
            step4_instagram: false,
            step5_pixel: false,
          },
          connected: false,
          source: 'no_auth',
        }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error(`[${functionName}] User lookup failed:`, userError);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          auth_connected: false,
          assets_configured: false,
          ready_to_run_ads: false,
          missing_required: ['authentication'],
          optional: { pixel_set: false, instagram_set: false },
          checkmarks: {
            step1_auth: false,
            step2_ad_account: false,
            step3_page: false,
            step4_instagram: false,
            step5_pixel: false,
          },
          connected: false,
          source: 'invalid_token',
        }),
      };
    }

    console.log(`[${functionName}] Checking status for user:`, user.id);

    const { data: creds, error: credsError } = await supabase
      .from('meta_credentials')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (credsError) {
      console.error(`[${functionName}] Database error:`, credsError);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          auth_connected: false,
          assets_configured: false,
          ready_to_run_ads: false,
          missing_required: ['database_error'],
          optional: { pixel_set: false, instagram_set: false },
          checkmarks: {
            step1_auth: false,
            step2_ad_account: false,
            step3_page: false,
            step4_instagram: false,
            step5_pixel: false,
          },
          connected: false,
          source: 'error',
          error: credsError.message,
        }),
      };
    }

    if (!creds || !creds.access_token) {
      console.log(`[${functionName}] No meta_credentials found, checking connected_accounts...`);

      const { data: connectedAccount } = await supabase
        .from('connected_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'meta')
        .maybeSingle();

      if (connectedAccount && connectedAccount.access_token) {
        const metadata = connectedAccount.metadata || {};
        const adAccountId = normalizeAdAccountId(metadata.ad_account_id);
        const pageId = metadata.page_id || metadata.facebook_page_id;
        const pixelId = metadata.pixel_id;
        const instagramActorId = metadata.instagram_actor_id || metadata.instagram_id;

        let tokenValid = true;
        if (connectedAccount.expires_at) {
          tokenValid = new Date(connectedAccount.expires_at) > new Date();
        }

        const missingRequired: string[] = [];
        if (!tokenValid) missingRequired.push('access_token');
        if (!adAccountId) missingRequired.push('ad_account_id');
        if (!pageId) missingRequired.push('page_id');

        const authConnected = tokenValid;
        const assetsConfigured = !!(adAccountId && pageId);

        console.log(`[${functionName}] Using connected_accounts fallback:`, {
          auth_connected: authConnected,
          assets_configured: assetsConfigured,
        });

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            auth_connected: authConnected,
            assets_configured: assetsConfigured,
            ready_to_run_ads: authConnected && assetsConfigured,
            ad_account_id: adAccountId,
            page_id: pageId,
            pixel_id: pixelId,
            instagram_actor_id: instagramActorId,
            missing_required: missingRequired,
            optional: {
              pixel_set: !!pixelId,
              instagram_set: !!instagramActorId,
            },
            checkmarks: {
              step1_auth: authConnected,
              step2_ad_account: !!adAccountId,
              step3_page: !!pageId,
              step4_instagram: !!instagramActorId,
              step5_pixel: !!pixelId,
            },
            connected: authConnected,
            canPostFB: !!pageId,
            canPostIG: !!instagramActorId,
            source: 'connected_accounts',
          }),
        };
      }

      console.log(`[${functionName}] No Meta connection found`);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          auth_connected: false,
          assets_configured: false,
          ready_to_run_ads: false,
          ad_account_id: null,
          page_id: null,
          pixel_id: null,
          instagram_actor_id: null,
          missing_required: ['access_token', 'ad_account_id', 'page_id'],
          optional: { pixel_set: false, instagram_set: false },
          checkmarks: {
            step1_auth: false,
            step2_ad_account: false,
            step3_page: false,
            step4_instagram: false,
            step5_pixel: false,
          },
          connected: false,
          needs_reconnect: false,
          setup_complete: false,
          source: 'none',
        }),
      };
    }

    const tokenCheck = await validateMetaToken(creds.access_token);

    if (!tokenCheck.valid) {
      const error = tokenCheck.error;
      const errorCode = error?.error?.code;

      console.log(`[${functionName}] Token validation failed:`, {
        code: errorCode,
        message: error?.error?.message?.substring(0, 100)
      });

      if (errorCode === 190) {
        console.log(`[${functionName}] OAuth 190 detected, marking needs_reconnect`);

        await supabase
          .from('meta_credentials')
          .update({
            is_active: false
          })
          .eq('user_id', user.id);

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            auth_connected: false,
            assets_configured: false,
            ready_to_run_ads: false,
            needs_reconnect: true,
            missing_required: ['access_token'],
            optional: { pixel_set: false, instagram_set: false },
            checkmarks: {
              step1_auth: false,
              step2_ad_account: false,
              step3_page: false,
              step4_instagram: false,
              step5_pixel: false,
            },
            connected: false,
            setup_complete: false,
            source: 'meta_credentials',
            token_invalid: true,
          }),
        };
      }
    }

    const adAccountId = normalizeAdAccountId(creds.ad_account_id || creds.default_ad_account_id);
    const pageId = creds.page_id || creds.default_page_id || creds.facebook_page_id;
    const pixelId = creds.pixel_id || creds.default_pixel_id;
    const instagramActorId = creds.instagram_actor_id || creds.instagram_id || creds.default_instagram_id;

    const missingRequired: string[] = [];
    if (!adAccountId) missingRequired.push('ad_account_id');
    if (!pageId) missingRequired.push('page_id');

    const authConnected = true;
    const assetsConfigured = !!(adAccountId && pageId);
    const readyToRunAds = authConnected && assetsConfigured;
    const setupComplete = assetsConfigured && !!creds.setup_completed_at;

    console.log(`[${functionName}] Status determined:`, {
      auth_connected: authConnected,
      assets_configured: assetsConfigured,
      ready_to_run_ads: readyToRunAds,
      ad_account_id: adAccountId,
      page_id: pageId,
      pixel_id: pixelId,
      instagram_actor_id: instagramActorId,
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        auth_connected: authConnected,
        assets_configured: assetsConfigured,
        ready_to_run_ads: readyToRunAds,
        ad_account_id: adAccountId,
        ad_account_name: creds.ad_account_name,
        page_id: pageId,
        page_name: creds.facebook_page_name || creds.page_name,
        pixel_id: pixelId,
        pixel_name: creds.pixel_name,
        instagram_actor_id: instagramActorId,
        instagram_username: creds.instagram_username,
        meta_user_id: creds.meta_user_id,
        meta_user_name: creds.meta_user_name,
        business_id: creds.business_id,
        missing_required: missingRequired,
        optional: {
          pixel_set: !!pixelId,
          instagram_set: !!instagramActorId,
        },
        checkmarks: {
          step1_auth: authConnected,
          step2_ad_account: !!adAccountId,
          step3_page: !!pageId,
          step4_instagram: !!instagramActorId,
          step5_pixel: !!pixelId,
        },
        connected: authConnected,
        needs_reconnect: creds.is_active === false,
        setup_complete: setupComplete,
        canPostFB: !!pageId && (creds.page_posting_enabled !== false),
        canPostIG: !!instagramActorId && (creds.instagram_posting_enabled !== false),
        selected: {
          ad_account_id: adAccountId,
          ad_account_name: creds.ad_account_name,
          page_id: pageId,
          page_name: creds.facebook_page_name,
          instagram_account_id: instagramActorId,
          instagram_username: creds.instagram_username,
          pixel_id: pixelId,
          pixel_name: creds.pixel_name,
        },
        source: 'meta_credentials',
      }),
    };
  } catch (error: any) {
    console.error(`[${functionName}] Fatal error:`, error);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        auth_connected: false,
        assets_configured: false,
        ready_to_run_ads: false,
        error: error.message,
        source: 'error',
        checkmarks: {
          step1_auth: false,
          step2_ad_account: false,
          step3_page: false,
          step4_instagram: false,
          step5_pixel: false,
        },
      }),
    };
  }
};
