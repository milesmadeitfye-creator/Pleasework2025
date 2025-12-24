import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };
}

/**
 * Publishes an image to Instagram using the Content Publishing API
 *
 * This uses a two-step process:
 * 1. Create media container (POST to /{ig-user-id}/media)
 * 2. Publish the container (POST to /{ig-user-id}/media_publish)
 *
 * This demonstrates instagram_content_publish permission usage for Meta's API dashboard
 */
export const handler: Handler = async (event) => {
  console.log('[meta-instagram-publish] Request received');

  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    // 1. Verify authentication
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[meta-instagram-publish] Missing or invalid authorization header');
      return jsonResponse(401, { error: 'UNAUTHORIZED' });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Verify the JWT and get the user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[meta-instagram-publish] Auth verification failed', authError);
      return jsonResponse(401, { error: 'INVALID_TOKEN' });
    }

    console.log('[meta-instagram-publish] User verified:', user.id.substring(0, 8) + '...');

    // 2. Parse request body
    const body = JSON.parse(event.body || '{}');
    const { imageUrl, caption } = body;

    if (!imageUrl) {
      return jsonResponse(400, {
        ok: false,
        error: 'Missing imageUrl in request body',
      });
    }

    if (!caption) {
      return jsonResponse(400, {
        ok: false,
        error: 'Missing caption in request body',
      });
    }

    console.log('[meta-instagram-publish] Publishing image to Instagram');
    console.log('[meta-instagram-publish] Image URL:', imageUrl);
    console.log('[meta-instagram-publish] Caption length:', caption.length);

    // 3. Get user's Meta connection and Instagram account
    const { data: metaConnection, error: connError } = await supabase
      .from('user_meta_connections')
      .select('access_token, meta_user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (connError || !metaConnection || !metaConnection.access_token) {
      console.error('[meta-instagram-publish] No Meta connection found:', connError);
      return jsonResponse(400, {
        ok: false,
        error: 'Meta account not connected. Please connect your Meta account first.',
      });
    }

    const userAccessToken = metaConnection.access_token;

    // 4. Get Instagram business account ID
    // First fetch pages to get page access token which has instagram_content_publish permission
    const pagesUrl = `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(
      userAccessToken
    )}`;

    console.log('[meta-instagram-publish] Fetching Facebook pages and Instagram accounts');

    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (!pagesRes.ok || pagesData.error) {
      console.error('[meta-instagram-publish] Failed to fetch pages:', pagesData);
      return jsonResponse(400, {
        ok: false,
        error: pagesData.error?.message || 'Failed to fetch Facebook pages. Please reconnect Meta.',
      });
    }

    if (!pagesData.data || pagesData.data.length === 0) {
      console.error('[meta-instagram-publish] No Facebook pages found');
      return jsonResponse(400, {
        ok: false,
        error: 'No Facebook pages found. Please ensure you have at least one Facebook page.',
      });
    }

    // Find the first page with an Instagram business account
    let instagramId: string | null = null;
    let pageAccessToken: string | null = null;
    let pageName: string | null = null;

    for (const page of pagesData.data) {
      if (page.instagram_business_account?.id) {
        instagramId = page.instagram_business_account.id;
        pageAccessToken = page.access_token;
        pageName = page.name;
        break;
      }
    }

    if (!instagramId || !pageAccessToken) {
      console.error('[meta-instagram-publish] No Instagram business account found');
      return jsonResponse(400, {
        ok: false,
        error: 'No Instagram business account found. Please connect your Instagram business account to your Facebook page.',
      });
    }

    console.log('[meta-instagram-publish] Using Instagram account:', instagramId);
    console.log('[meta-instagram-publish] Using page:', pageName);

    // 5. STEP 1: Create media container
    // Using page access token which has instagram_content_publish permission
    const createMediaUrl = `https://graph.facebook.com/v20.0/${instagramId}/media`;
    const createMediaPayload = {
      image_url: imageUrl,
      caption: caption,
      access_token: pageAccessToken,
    };

    console.log('[meta-instagram-publish] Step 1: Creating media container');

    const createMediaRes = await fetch(createMediaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createMediaPayload),
    });

    const createMediaData = await createMediaRes.json();

    if (!createMediaRes.ok || createMediaData.error) {
      console.error('[meta-instagram-publish] Failed to create media container:', {
        status: createMediaRes.status,
        error: createMediaData.error,
        message: createMediaData.error?.message,
      });

      return jsonResponse(500, {
        ok: false,
        error: createMediaData.error?.message || `Failed to create Instagram media container (${createMediaRes.status})`,
        metaError: createMediaData.error,
      });
    }

    const creationId = createMediaData.id;
    console.log('[meta-instagram-publish] Media container created:', creationId);

    // 6. STEP 2: Publish the media container
    const publishMediaUrl = `https://graph.facebook.com/v20.0/${instagramId}/media_publish`;
    const publishMediaPayload = {
      creation_id: creationId,
      access_token: pageAccessToken,
    };

    console.log('[meta-instagram-publish] Step 2: Publishing media container');

    const publishMediaRes = await fetch(publishMediaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(publishMediaPayload),
    });

    const publishMediaData = await publishMediaRes.json();

    if (!publishMediaRes.ok || publishMediaData.error) {
      console.error('[meta-instagram-publish] Failed to publish media:', {
        status: publishMediaRes.status,
        error: publishMediaData.error,
        message: publishMediaData.error?.message,
      });

      return jsonResponse(500, {
        ok: false,
        error: publishMediaData.error?.message || `Failed to publish Instagram post (${publishMediaRes.status})`,
        metaError: publishMediaData.error,
        creationId, // Return creation ID for debugging
      });
    }

    const publishId = publishMediaData.id;
    console.log('[meta-instagram-publish] Post published successfully:', publishId);

    // Success!
    return jsonResponse(200, {
      ok: true,
      creationId,
      publishId,
      instagramId,
      message: 'Post published to Instagram successfully',
    });
  } catch (err: any) {
    console.error('[meta-instagram-publish] Fatal error:', {
      message: err.message,
      stack: err.stack,
    });
    return jsonResponse(500, {
      ok: false,
      error: 'INTERNAL_ERROR',
      message: err.message,
    });
  }
};
