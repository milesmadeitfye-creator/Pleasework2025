import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('[meta-create-post] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const META_GRAPH_VERSION = 'v21.0';
const META_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface PostRequest {
  platform: 'facebook' | 'instagram';
  message?: string;
  imageUrl?: string;
  videoUrl?: string;
  scheduledAt?: string;
}

async function postToFacebook(
  pageId: string,
  accessToken: string,
  message?: string,
  imageUrl?: string,
  videoUrl?: string
): Promise<{ success: boolean; result?: any; error?: string; details?: string }> {
  try {
    const url = new URL(`${META_BASE_URL}/${pageId}/feed`);

    const params: Record<string, string> = {
      access_token: accessToken,
    };

    if (message) {
      params.message = message;
    }

    if (videoUrl || imageUrl) {
      params.link = videoUrl || imageUrl!;
    }

    Object.keys(params).forEach((key) => {
      url.searchParams.set(key, params[key]);
    });

    console.log('[meta-create-post] Posting to Facebook page:', pageId);

    const res = await fetch(url.toString(), { method: 'POST' });
    const raw = await res.text();

    if (!res.ok) {
      console.error('[meta-create-post] Facebook post failed:', res.status, raw);
      return {
        success: false,
        error: 'META_POST_FAILED',
        details: raw,
      };
    }

    const result = JSON.parse(raw);
    console.log('[meta-create-post] Facebook post succeeded:', result.id);

    return {
      success: true,
      result,
    };
  } catch (err: any) {
    console.error('[meta-create-post] Facebook post error:', err);
    return {
      success: false,
      error: 'META_POST_FAILED',
      details: err.message,
    };
  }
}

async function postToInstagram(
  igUserId: string,
  accessToken: string,
  message?: string,
  imageUrl?: string,
  videoUrl?: string
): Promise<{ success: boolean; result?: any; error?: string; details?: string }> {
  try {
    // Step 1: Create media container
    console.log('[meta-create-post] Creating Instagram media container for user:', igUserId);

    const creationParams: Record<string, string> = {
      access_token: accessToken,
    };

    if (message) {
      creationParams.caption = message;
    }

    if (videoUrl) {
      creationParams.video_url = videoUrl;
      creationParams.media_type = 'VIDEO';
    } else if (imageUrl) {
      creationParams.image_url = imageUrl;
      creationParams.media_type = 'IMAGE';
    } else {
      return {
        success: false,
        error: 'INVALID_REQUEST',
        details: 'Instagram posts require either imageUrl or videoUrl',
      };
    }

    const creationRes = await fetch(`${META_BASE_URL}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(creationParams).toString(),
    });

    const creationRaw = await creationRes.text();

    if (!creationRes.ok) {
      console.error('[meta-create-post] Instagram container creation failed:', creationRes.status, creationRaw);
      return {
        success: false,
        error: 'META_POST_FAILED',
        details: creationRaw,
      };
    }

    const creationJson = JSON.parse(creationRaw || '{}');

    if (!creationJson.id) {
      console.error('[meta-create-post] No container ID returned:', creationJson);
      return {
        success: false,
        error: 'META_POST_FAILED',
        details: 'No container ID returned from Instagram',
      };
    }

    console.log('[meta-create-post] Container created:', creationJson.id);

    // Step 2: Publish media
    const publishRes = await fetch(`${META_BASE_URL}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        creation_id: creationJson.id,
        access_token: accessToken,
      }).toString(),
    });

    const publishRaw = await publishRes.text();

    if (!publishRes.ok) {
      console.error('[meta-create-post] Instagram publish failed:', publishRes.status, publishRaw);
      return {
        success: false,
        error: 'META_POST_FAILED',
        details: publishRaw,
      };
    }

    const publishJson = JSON.parse(publishRaw || '{}');
    console.log('[meta-create-post] Instagram post published:', publishJson.id);

    return {
      success: true,
      result: publishJson,
    };
  } catch (err: any) {
    console.error('[meta-create-post] Instagram post error:', err);
    return {
      success: false,
      error: 'META_POST_FAILED',
      details: err.message,
    };
  }
}

export const handler: Handler = async (event) => {
  console.log('[meta-create-post] Request received:', event.httpMethod);

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
      body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }),
    };
  }

  try {
    // 1. Parse Authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    if (!token) {
      console.error('[meta-create-post] Missing Authorization header');
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'UNAUTHORIZED',
          message: 'Missing Authorization header',
        }),
      };
    }

    // 2. Verify user from JWT
    console.log('[meta-create-post] Verifying user from JWT');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData?.user) {
      console.error('[meta-create-post] getUser failed:', userError);
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'UNAUTHORIZED',
          message: 'Invalid user token',
        }),
      };
    }

    const userId = userData.user.id;
    console.log('[meta-create-post] User verified:', userId);

    // 3. Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'INVALID_REQUEST',
          message: 'Missing request body',
        }),
      };
    }

    const body: PostRequest = JSON.parse(event.body);
    const { platform, message, imageUrl, videoUrl, scheduledAt } = body;

    if (!platform || !['facebook', 'instagram'].includes(platform)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'INVALID_REQUEST',
          message: 'Invalid platform. Must be "facebook" or "instagram"',
        }),
      };
    }

    console.log('[meta-create-post] Creating post for platform:', platform);

    // 4. Load meta_credentials
    const { data: creds, error: credsError } = await supabase
      .from('meta_credentials')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (credsError || !creds) {
      console.error('[meta-create-post] Failed to load meta_credentials:', credsError);
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_NOT_CONNECTED',
          message: 'No Meta account connected. Please connect your Meta account first.',
        }),
      };
    }

    const accessToken = creds.access_token || creds.system_user_token;

    if (!accessToken) {
      console.error('[meta-create-post] No access token found');
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'META_NOT_CONNECTED',
          message: 'No valid Meta access token found',
        }),
      };
    }

    // 5. Branch on platform
    let postResult: { success: boolean; result?: any; error?: string; details?: string };

    if (platform === 'facebook') {
      const pageId = creds.default_page_id || creds.page_id;

      if (!pageId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: 'NO_PAGE_CONFIGURED',
            message: 'No Facebook page configured. Please configure a default page in Meta settings.',
          }),
        };
      }

      if (!creds.page_posting_enabled) {
        console.warn('[meta-create-post] Facebook posting not enabled for user:', userId);
      }

      postResult = await postToFacebook(pageId, accessToken, message, imageUrl, videoUrl);
    } else {
      // Instagram
      const igUserId = creds.default_instagram_id;

      if (!igUserId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error: 'NO_INSTAGRAM_CONFIGURED',
            message: 'No Instagram account configured. Please configure a default Instagram account in Meta settings.',
          }),
        };
      }

      if (!creds.instagram_posting_enabled) {
        console.warn('[meta-create-post] Instagram posting not enabled for user:', userId);
      }

      postResult = await postToInstagram(igUserId, accessToken, message, imageUrl, videoUrl);
    }

    // 6. Return result
    if (!postResult.success) {
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: postResult.error || 'META_POST_FAILED',
          platform,
          message: `Failed to publish ${platform} post.`,
          details: postResult.details,
        }),
      };
    }

    console.log('[meta-create-post] Post created successfully');
    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        platform,
        result: postResult.result,
      }),
    };
  } catch (err: any) {
    console.error('[meta-create-post] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'META_CREATE_POST_FAILED',
        message: 'Failed to create Meta post.',
        details: err?.message || 'Unknown error',
      }),
    };
  }
};
