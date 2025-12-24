import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify(data),
  };
}

/**
 * Returns the user's Meta account configuration for ads UI
 * Reads from user_meta_assets (wizard saves here)
 */
export const handler: Handler = async (event) => {
  console.log('[meta-ads-context] Request received:', event.httpMethod);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('[meta-ads-context] Supabase env missing');
    return jsonResponse(500, {
      error: 'META_ADS_CONFIG_ERROR',
      message: 'Supabase credentials are not configured',
    });
  }

  // Get user from JWT
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'UNAUTHORIZED', message: 'Missing or invalid JWT' });
  }

  const jwt = authHeader.replace('Bearer ', '').trim();

  // Service role client
  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  // Verify JWT and get user
  const { data: { user }, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !user) {
    console.error('[meta-ads-context] Auth error:', userError);
    return jsonResponse(401, { error: 'UNAUTHORIZED', message: 'Invalid user token' });
  }

  const userId = user.id;
  console.log('[meta-ads-context] User verified:', userId.substring(0, 8) + '...');

  // Read from user_meta_assets (same table wizard uses)
  const { data, error } = await admin
    .from('user_meta_assets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[meta-ads-context] DB error', error);
    return jsonResponse(500, {
      error: 'META_ADS_CONFIG_ERROR',
      message: 'Failed to load Meta account configuration',
      details: error.message,
    });
  }

  if (!data) {
    // No config yet – ads UI should show "connect Meta"
    console.log('[meta-ads-context] No config found for user');
    return jsonResponse(200, {
      hasConfig: false,
      business: null,
      profile: null,
      page: null,
      instagram: null,
      adAccount: null,
      pixel: null,
    });
  }

  console.log('[meta-ads-context] Config found:', {
    business: data.business_id,
    profile: data.meta_profile_id,
    page: data.page_id,
    instagram: data.instagram_id,
    adAccount: data.ad_account_id,
    pixel: data.pixel_id,
  });

  // Check if required fields are present
  // Setup is complete if: ad_account_id exists (required for ads)
  // page_id is recommended but not strictly required
  const hasRequiredFields = !!(data.ad_account_id);

  console.log('[meta-ads-context] Required fields check:', {
    hasAdAccount: !!data.ad_account_id,
    hasRequiredFields,
  });

  // Normalize config into a clean shape for the frontend
  const response = {
    hasConfig: hasRequiredFields,
    business: data.business_id
      ? { id: data.business_id, name: data.business_name || 'Business' }
      : null,
    profile: data.meta_profile_id
      ? {
          id: data.meta_profile_id,
          name: data.meta_profile_name || 'Profile',
          pictureUrl: data.meta_profile_picture_url || null,
        }
      : null,
    page: data.page_id
      ? { id: data.page_id, name: data.page_name || 'Facebook Page' }
      : null,
    instagram: data.instagram_id
      ? {
          id: data.instagram_id,
          username: data.instagram_username || 'instagram',
          linked_page_id: data.page_id || null,
        }
      : null,
    adAccount: data.ad_account_id
      ? {
          id: data.ad_account_id,
          name: data.ad_account_name || 'Ad Account',
          currency: data.ad_account_currency || null,
        }
      : null,
    pixel: data.pixel_id
      ? { id: data.pixel_id, name: data.pixel_name || 'Pixel' }
      : null,
  };

  return jsonResponse(200, response);
};

export default handler;
