import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { normalizeAdAccountId } from './_metaAdAccountNormalizer';
import { upsertAppSecret } from './_lib/appSecrets';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[meta-save-config] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Fetches Instagram Business Account ID linked to a Facebook Page.
 * This is the instagram_actor_id required for Instagram ad placements.
 */
async function fetchInstagramActorId(pageId: string, pageAccessToken: string): Promise<{
  igId: string | null;
  igUsername: string | null;
  raw: any;
}> {
  try {
    const url = `https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account{id,username}&access_token=${pageAccessToken}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!res.ok) {
      console.error('[fetchInstagramActorId] Meta API error:', json);
      return { igId: null, igUsername: null, raw: json };
    }

    const igId = json?.instagram_business_account?.id ?? null;
    const igUsername = json?.instagram_business_account?.username ?? null;

    if (igId) {
      console.log('[fetchInstagramActorId] Found Instagram actor ID:', igId.substring(0, 15) + '...');
    } else {
      console.log('[fetchInstagramActorId] No Instagram Business Account linked to this page');
    }

    return { igId, igUsername, raw: json };
  } catch (err) {
    console.error('[fetchInstagramActorId] Unexpected error:', err);
    return { igId: null, igUsername: null, raw: null };
  }
}

export const handler: Handler = async (event) => {
  console.log('[meta-save-config] Request received:', event.httpMethod);

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
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    if (!token) {
      console.error('[meta-save-config] Missing Authorization header');
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_CONFIG_AUTH_FAILED',
          message: 'Missing Authorization header',
        }),
      };
    }

    console.log('[meta-save-config] Verifying user from JWT');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !userData?.user) {
      console.error('[meta-save-config] getUser failed:', authError);
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_CONFIG_AUTH_FAILED',
          message: 'Invalid user from JWT',
        }),
      };
    }

    const userId = userData.user.id;
    console.log('[meta-save-config] User verified:', userId);

    let body: any = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (err) {
      console.error('[meta-save-config] Invalid JSON body:', err);
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_CONFIG_BAD_BODY',
          message: 'Invalid JSON body.',
        }),
      };
    }

    const {
      // Wizard asset selections
      adAccountId,
      ad_account_id,
      adAccountName,
      ad_account_name,
      pageId,
      page_id,
      pageName,
      page_name,
      instagramId,
      instagram_id,
      instagramUsername,
      instagram_username,
      pixelName,
      pixel_name,

      // Tracking fields (camelCase from frontend)
      pixelId,
      conversionApiToken,
      pixelVerified,
      capiEnabled,
      configurationComplete,

      // Posting fields (support both camelCase and snake_case)
      default_page_id,
      default_instagram_id,
      defaultPageId,
      defaultInstagramId,
      page_posting_enabled,
      instagram_posting_enabled,
      pagePostingEnabled,
      instagramPostingEnabled,
    } = body;

    // Build a partial update payload
    const updatePayload: any = {};

    // Wizard asset selections
    const resolvedAdAccountId = adAccountId ?? ad_account_id;
    const resolvedAdAccountName = adAccountName ?? ad_account_name;
    const resolvedPageId = pageId ?? page_id;
    const resolvedPageName = pageName ?? page_name;
    const resolvedInstagramId = instagramId ?? instagram_id;
    const resolvedInstagramUsername = instagramUsername ?? instagram_username;
    const resolvedPixelName = pixelName ?? pixel_name;

    if (resolvedAdAccountId !== undefined) {
      updatePayload.ad_account_id = normalizeAdAccountId(resolvedAdAccountId);
    }
    if (resolvedAdAccountName !== undefined) {
      updatePayload.ad_account_name = resolvedAdAccountName || null;
    }
    if (resolvedPageId !== undefined) {
      updatePayload.page_id = resolvedPageId || null;
      updatePayload.facebook_page_id = resolvedPageId || null; // dual write for compatibility

      // 🔥 CRITICAL: Fetch instagram_actor_id from the page when page_id is being set
      // This is required for Instagram ad placements to work
      if (resolvedPageId) {
        console.log('[meta-save-config] Fetching Instagram actor ID for page:', resolvedPageId);

        // Get page_access_token from existing meta_credentials
        const { data: existingCreds } = await supabase
          .from('meta_credentials')
          .select('page_access_token')
          .eq('user_id', userId)
          .maybeSingle();

        const pageAccessToken = existingCreds?.page_access_token;

        if (pageAccessToken) {
          const { igId, igUsername } = await fetchInstagramActorId(resolvedPageId, pageAccessToken);

          if (igId) {
            updatePayload.instagram_actor_id = igId;
            updatePayload.instagram_business_account_id = igId; // Store in both for compatibility
            console.log('[meta-save-config] ✅ Instagram actor ID stored:', igId.substring(0, 15) + '...');
          } else {
            updatePayload.instagram_actor_id = null;
            updatePayload.instagram_business_account_id = null;
            console.log('[meta-save-config] ⚠️ No Instagram Business Account linked - campaigns will be Facebook-only');
          }

          // Also store username if found
          if (igUsername) {
            updatePayload.instagram_username = igUsername;
          }
        } else {
          console.warn('[meta-save-config] No page_access_token found - cannot fetch Instagram actor ID');
        }
      }
    }
    if (resolvedPageName !== undefined) {
      updatePayload.facebook_page_name = resolvedPageName || null;
    }
    if (resolvedInstagramId !== undefined) {
      updatePayload.instagram_id = resolvedInstagramId || null;
    }
    if (resolvedInstagramUsername !== undefined) {
      updatePayload.instagram_username = resolvedInstagramUsername || null;
    }
    if (resolvedPixelName !== undefined) {
      updatePayload.pixel_name = resolvedPixelName || null;
    }

    // Tracking fields
    if (pixelId !== undefined) {
      updatePayload.pixel_id = pixelId || null;
    }

    if (conversionApiToken !== undefined) {
      updatePayload.conversion_api_token = conversionApiToken || null;
    }

    if (capiEnabled !== undefined) {
      updatePayload.capi_enabled = !!capiEnabled;
    }

    if (pixelVerified !== undefined) {
      updatePayload.pixel_verified = !!pixelVerified;
    }

    if (configurationComplete !== undefined) {
      updatePayload.configuration_complete = !!configurationComplete;
      // Set setup_completed_at when marking configuration as complete
      if (configurationComplete) {
        updatePayload.setup_completed_at = new Date().toISOString();
      }
    }

    // Page / IG defaults + posting toggles (support both camel & snake case)
    const resolvedDefaultPageId = defaultPageId ?? default_page_id;
    const resolvedDefaultIgId = defaultInstagramId ?? default_instagram_id;

    if (resolvedDefaultPageId !== undefined) {
      updatePayload.default_page_id = resolvedDefaultPageId || null;
    }

    if (resolvedDefaultIgId !== undefined) {
      updatePayload.default_instagram_id = resolvedDefaultIgId || null;
    }

    const resolvedPagePosting = pagePostingEnabled ?? page_posting_enabled;
    const resolvedIgPosting = instagramPostingEnabled ?? instagram_posting_enabled;

    if (resolvedPagePosting !== undefined) {
      updatePayload.page_posting_enabled = !!resolvedPagePosting;
    }

    if (resolvedIgPosting !== undefined) {
      updatePayload.instagram_posting_enabled = !!resolvedIgPosting;
    }

    console.log('[meta-save-config] Updating meta_credentials with:', updatePayload);

    if (Object.keys(updatePayload).length === 0) {
      console.log('[meta-save-config] No fields to update, returning success');
      return {
        statusCode: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ success: true, meta: null }),
      };
    }

    // ATTEMPT 1: Try with all fields (including metadata)
    let { data, error } = await supabase
      .from('meta_credentials')
      .update(updatePayload)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    // DEFENSIVE RETRY: If schema cache is stale (PGRST204), retry with core IDs only
    if (error && error.code === 'PGRST204') {
      console.warn('[meta-save-config] PGRST204 detected (schema cache stale). Retrying with core IDs only...');

      // Build stripped payload with ONLY core ID fields
      const corePayload: any = {};
      if (updatePayload.ad_account_id !== undefined) corePayload.ad_account_id = updatePayload.ad_account_id;
      if (updatePayload.page_id !== undefined) corePayload.page_id = updatePayload.page_id;
      if (updatePayload.facebook_page_id !== undefined) corePayload.facebook_page_id = updatePayload.facebook_page_id;
      if (updatePayload.instagram_id !== undefined) corePayload.instagram_id = updatePayload.instagram_id;
      if (updatePayload.pixel_id !== undefined) corePayload.pixel_id = updatePayload.pixel_id;
      if (updatePayload.conversion_api_token !== undefined) corePayload.conversion_api_token = updatePayload.conversion_api_token;
      if (updatePayload.capi_enabled !== undefined) corePayload.capi_enabled = updatePayload.capi_enabled;
      if (updatePayload.pixel_verified !== undefined) corePayload.pixel_verified = updatePayload.pixel_verified;
      if (updatePayload.configuration_complete !== undefined) corePayload.configuration_complete = updatePayload.configuration_complete;
      if (updatePayload.setup_completed_at !== undefined) corePayload.setup_completed_at = updatePayload.setup_completed_at;
      if (updatePayload.default_page_id !== undefined) corePayload.default_page_id = updatePayload.default_page_id;
      if (updatePayload.default_instagram_id !== undefined) corePayload.default_instagram_id = updatePayload.default_instagram_id;
      if (updatePayload.page_posting_enabled !== undefined) corePayload.page_posting_enabled = updatePayload.page_posting_enabled;
      if (updatePayload.instagram_posting_enabled !== undefined) corePayload.instagram_posting_enabled = updatePayload.instagram_posting_enabled;
      if (updatePayload.instagram_actor_id !== undefined) corePayload.instagram_actor_id = updatePayload.instagram_actor_id;
      if (updatePayload.instagram_business_account_id !== undefined) corePayload.instagram_business_account_id = updatePayload.instagram_business_account_id;
      if (updatePayload.instagram_username !== undefined) corePayload.instagram_username = updatePayload.instagram_username;

      console.log('[meta-save-config] Retry payload (core IDs only):', corePayload);

      // ATTEMPT 2: Retry with stripped payload
      const retryResult = await supabase
        .from('meta_credentials')
        .update(corePayload)
        .eq('user_id', userId)
        .select()
        .maybeSingle();

      data = retryResult.data;
      error = retryResult.error;

      if (error) {
        console.error('[meta-save-config] Retry FAILED:', error);
      } else {
        console.log('[meta-save-config] Retry SUCCESS. Schema cache was stale but save completed.');
      }
    }

    if (error) {
      console.error('[meta-save-config] Update error:', error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_CONFIG_SAVE_FAILED',
          message: error.message,
          code: error.code,
        }),
      };
    }

    console.log('[meta-save-config] Update OK:', data);

    // 🔥 CRITICAL: Also persist to app_secrets for public-safe Smart Link access
    try {
      const secretPromises: Promise<void>[] = [];

      if (pixelId !== undefined && pixelId) {
        secretPromises.push(upsertAppSecret(userId, 'META_PIXEL_ID', String(pixelId).trim()));
      }

      if (conversionApiToken !== undefined && conversionApiToken) {
        secretPromises.push(upsertAppSecret(userId, 'META_CAPI_ACCESS_TOKEN', String(conversionApiToken).trim()));
      }

      if (capiEnabled !== undefined) {
        secretPromises.push(upsertAppSecret(userId, 'META_CAPI_ENABLED', capiEnabled ? 'true' : 'false'));
      }

      if (data?.test_event_code) {
        secretPromises.push(upsertAppSecret(userId, 'META_TEST_EVENT_CODE', String(data.test_event_code).trim()));
      }

      if (secretPromises.length > 0) {
        await Promise.all(secretPromises);
        console.log('[meta-save-config] ✅ Meta settings also persisted to app_secrets');
      }
    } catch (secretErr) {
      console.error('[meta-save-config] ⚠️ Failed to persist to app_secrets (non-fatal):', secretErr);
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        meta: data,
      }),
    };
  } catch (err: any) {
    console.error('[meta-save-config] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'META_CONFIG_SAVE_FAILED',
        message: err?.message || 'Unknown error',
      }),
    };
  }
};
