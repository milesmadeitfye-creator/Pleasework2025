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
};

/**
 * Lightweight check to validate Meta access token
 */
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
    // 1. Authenticate user from JWT
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      console.log(`[${functionName}] Missing authorization header`);
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing authorization header',
          debug: { token_present: false }
        }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error(`[${functionName}] User lookup failed:`, userError);
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Unauthorized',
          debug: { token_present: false }
        }),
      };
    }

    console.log(`[${functionName}] Checking status for user:`, user.id);

    // 2. Query meta_credentials (SOURCE OF TRUTH)
    const { data: creds, error: credsError } = await supabase
      .from('meta_credentials')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const debugInfo = {
      user_id: user.id,
      row_found: !!creds,
      token_present: !!creds?.access_token,
      token_len: creds?.access_token?.length || 0,
      token_field: 'access_token',
      ad_account_id: !!creds?.ad_account_id,
      page_id: !!creds?.page_id,
      setup_completed_at: !!creds?.setup_completed_at,
      is_active: creds?.is_active !== false,
    };

    console.log(`[${functionName}] Query result:`, debugInfo);

    if (credsError) {
      console.error(`[${functionName}] Database error:`, credsError);
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Database error',
          debug: debugInfo
        }),
      };
    }

    // 3. If no credentials or no token = not connected
    if (!creds || !creds.access_token) {
      console.log(`[${functionName}] No Meta connection found`);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connected: false,
          needs_reconnect: false,
          setup_complete: false,
          selected: {
            ad_account_id: null,
            ad_account_name: null,
            page_id: null,
            page_name: null,
            instagram_account_id: null,
            instagram_username: null,
            pixel_id: null,
            pixel_name: null,
          },
          debug: debugInfo
        }),
      };
    }

    // 4. Validate token with Meta API (lightweight check)
    const tokenCheck = await validateMetaToken(creds.access_token);

    if (!tokenCheck.valid) {
      const error = tokenCheck.error;
      const errorCode = error?.error?.code;
      const errorSubcode = error?.error?.error_subcode;

      console.log(`[${functionName}] Token validation failed:`, {
        code: errorCode,
        subcode: errorSubcode,
        message: error?.error?.message?.substring(0, 100)
      });

      // OAuth error 190 = token invalid/expired
      if (errorCode === 190) {
        console.log(`[${functionName}] OAuth 190 detected, clearing token`);

        // Clear the invalid token
        await supabase
          .from('meta_credentials')
          .update({
            access_token: null,
            token_expires_at: null,
            is_active: false
          })
          .eq('user_id', user.id);

        return {
          statusCode: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connected: false,
            needs_reconnect: true,
            setup_complete: false,
            selected: {
              ad_account_id: null,
              ad_account_name: null,
              page_id: null,
              page_name: null,
              instagram_account_id: null,
              instagram_username: null,
              pixel_id: null,
              pixel_name: null,
            },
            debug: {
              ...debugInfo,
              meta_error_code: errorCode,
              meta_error_subcode: errorSubcode,
              token_cleared: true
            }
          }),
        };
      }
    }

    // 5. Token is valid - determine connection state
    const connected = true;
    const needsReconnect = !creds.is_active;

    // setup_complete = ad_account_id AND page_id present (business_id NOT required, pixel optional)
    const setupComplete = connected &&
                          !!creds.ad_account_id &&
                          !!creds.page_id &&
                          !!creds.setup_completed_at;

    console.log(`[${functionName}] Status determined:`, {
      connected,
      needs_reconnect: needsReconnect,
      setup_complete: setupComplete,
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connected,
        needs_reconnect: needsReconnect,
        setup_complete: setupComplete,
        selected: {
          ad_account_id: creds.ad_account_id,
          ad_account_name: creds.ad_account_name,
          page_id: creds.page_id || creds.facebook_page_id,
          page_name: creds.facebook_page_name,
          instagram_account_id: creds.instagram_id || creds.default_instagram_id,
          instagram_username: creds.instagram_username,
          pixel_id: creds.pixel_id,
          pixel_name: creds.pixel_name,
        },
        debug: {
          ...debugInfo,
          meta_api_check: tokenCheck.valid ? 'passed' : 'failed',
        }
      }),
    };
  } catch (error: any) {
    console.error(`[${functionName}] Fatal error:`, error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error?.message,
        debug: { fatal_error: true }
      }),
    };
  }
};
