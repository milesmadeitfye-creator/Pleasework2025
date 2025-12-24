import { Handler, HandlerEvent } from '@netlify/functions';
import { getMetaCredentials } from './_lib/metaAuth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Get userId and debug flag from query string
    const userId = event.queryStringParameters?.userId;
    const debug = event.queryStringParameters?.debug === '1';

    if (!userId) {
      console.warn('[META_LIST_PIXELS] Missing userId parameter');
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'userId is required' }),
      };
    }

    console.log('[META_LIST_PIXELS] Fetching credentials for user:', userId.substring(0, 8) + '...');

    // Get Meta credentials from user's connected account
    const credentials = await getMetaCredentials(userId);

    if (!credentials || !credentials.access_token) {
      console.warn('[META_LIST_PIXELS] User not connected or missing access token');
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: "Couldn't load pixels — check your connected Meta account permissions.",
        }),
      };
    }

    const accessToken = credentials.access_token;
    const rawAdAccountId = credentials.ad_account_id;

    // Normalize ad account ID (don't double-prefix act_)
    const adAccountId = rawAdAccountId?.startsWith('act_')
      ? rawAdAccountId.substring(4)
      : rawAdAccountId;

    console.log('[META_LIST_PIXELS] Using ad account:', adAccountId ? `act_${adAccountId}` : 'none');

    let adAccountPixels: any[] = [];
    let businessPixels: any[] = [];
    let sourceUsed = 'none';

    // Step 1: Try ad account pixels first (if we have an ad account)
    if (adAccountId) {
      try {
        console.log('[META_LIST_PIXELS] Fetching ad account pixels...');
        const adAccountUrl = `https://graph.facebook.com/v20.0/act_${adAccountId}/adspixels?fields=id,name&access_token=${accessToken}`;

        const adAccountResponse = await fetch(adAccountUrl);
        const adAccountData = await adAccountResponse.json();

        if (adAccountResponse.ok && !adAccountData.error) {
          adAccountPixels = adAccountData.data || [];
          console.log('[META_LIST_PIXELS] Ad account pixels:', adAccountPixels.length);
        } else {
          console.warn('[META_LIST_PIXELS] Ad account pixels failed:', adAccountData.error?.message);
        }
      } catch (err: any) {
        console.warn('[META_LIST_PIXELS] Error fetching ad account pixels:', err?.message);
      }
    }

    // Step 2: If no ad account pixels, fall back to business-owned pixels
    if (adAccountPixels.length === 0) {
      try {
        console.log('[META_LIST_PIXELS] Fetching business-owned pixels...');
        const businessUrl = `https://graph.facebook.com/v20.0/me/businesses?fields=id,name,owned_pixels.limit(200){id,name}&access_token=${accessToken}`;

        const businessResponse = await fetch(businessUrl);
        const businessData = await businessResponse.json();

        if (businessResponse.ok && !businessData.error) {
          const businesses = businessData.data || [];
          console.log('[META_LIST_PIXELS] Found', businesses.length, 'businesses');

          // Extract pixels from all businesses
          for (const business of businesses) {
            if (business.owned_pixels?.data) {
              businessPixels.push(...business.owned_pixels.data);
            }
          }
          console.log('[META_LIST_PIXELS] Business pixels:', businessPixels.length);
        } else {
          console.warn('[META_LIST_PIXELS] Business pixels failed:', businessData.error?.message);

          // If this is a permission error, return 403
          if (businessData.error?.code === 200) {
            return {
              statusCode: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                error: "Insufficient permissions to list pixels",
                details: businessData.error.message,
              }),
            };
          }
        }
      } catch (err: any) {
        console.warn('[META_LIST_PIXELS] Error fetching business pixels:', err?.message);
      }
    }

    // Step 3: Merge and dedupe pixels
    const allPixels = [...adAccountPixels, ...businessPixels];
    const pixelMap = new Map<string, any>();

    for (const pixel of allPixels) {
      if (pixel.id && !pixelMap.has(pixel.id)) {
        pixelMap.set(pixel.id, {
          id: pixel.id,
          name: pixel.name || `Pixel ${pixel.id}`,
        });
      }
    }

    const pixels = Array.from(pixelMap.values());

    // Determine source used
    if (adAccountPixels.length > 0 && businessPixels.length > 0) {
      sourceUsed = 'merged';
    } else if (adAccountPixels.length > 0) {
      sourceUsed = 'ad_account';
    } else if (businessPixels.length > 0) {
      sourceUsed = 'business_owned';
    }

    console.log('[META_LIST_PIXELS] Final pixel count:', pixels.length, '| Source:', sourceUsed);

    const response: any = { pixels };

    // Add debug info if requested
    if (debug) {
      response.debug = {
        sourceUsed,
        counts: {
          adAccountPixels: adAccountPixels.length,
          businessPixels: businessPixels.length,
          merged: pixels.length,
        },
        adAccountIdUsed: adAccountId ? `act_${adAccountId}` : null,
      };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('[META_LIST_PIXELS] Error:', error?.message || error);
    console.error('[META_LIST_PIXELS] Stack:', error?.stack);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: "Couldn't load pixels — check your connected Meta account permissions.",
      }),
    };
  }
};
