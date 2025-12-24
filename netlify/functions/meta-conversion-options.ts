import { Handler, HandlerEvent } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const STANDARD_EVENTS = [
  'Purchase',
  'Lead',
  'CompleteRegistration',
  'AddToCart',
  'InitiateCheckout',
  'ViewContent',
  'Search',
  'AddPaymentInfo',
  'AddToWishlist',
  'Subscribe',
];

const GHOSTE_CUSTOM_EVENTS = [
  'SmartLinkOutbound',
  'SmartLinkClicked',
  'SmartLinkView',
  'SpotifyLinkClicked',
  'AppleMusicLinkClicked',
  'YouTubeLinkClicked',
  'SoundCloudLinkClicked',
  'TidalLinkClicked',
];

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
    const params = new URLSearchParams(event.queryStringParameters || {});
    const pixelId = params.get('pixelId');
    const adAccountId = params.get('adAccountId');
    const userId = params.get('userId');

    if (!pixelId) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'pixelId is required' }),
      };
    }

    if (!userId) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'userId is required' }),
      };
    }

    const supabase = getSupabaseAdmin();

    // Get user's Meta access token
    const { data: creds, error: credsError } = await supabase
      .from('meta_credentials')
      .select('access_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (credsError || !creds?.access_token) {
      console.error('[CONVERSION_OPTIONS] No Meta credentials found:', credsError?.message);
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Meta credentials not found' }),
      };
    }

    const accessToken = creds.access_token;
    const debug: any = {};

    // 1. STANDARD EVENTS (always available)
    const standardEvents = [...STANDARD_EVENTS];

    // 2. CUSTOM CONVERSIONS (most reliable)
    let customConversions: Array<{ id: string; name: string; event_name?: string }> = [];

    if (adAccountId) {
      try {
        const ccUrl = `https://graph.facebook.com/v21.0/act_${adAccountId}/customconversions?fields=id,name,custom_event_type,event_source_type,event_source_id&access_token=${accessToken}`;
        const ccResponse = await fetch(ccUrl);
        const ccData = await ccResponse.json();

        if (ccResponse.ok && ccData.data) {
          // Filter to pixel-based custom conversions matching our pixel
          customConversions = ccData.data
            .filter((cc: any) =>
              cc.event_source_type === 'PIXEL' &&
              cc.event_source_id === pixelId
            )
            .map((cc: any) => ({
              id: cc.id,
              name: cc.name,
              event_name: cc.custom_event_type || undefined,
            }));

          debug.customConversions = {
            total: ccData.data.length,
            filtered: customConversions.length,
          };
        } else {
          debug.customConversions = { error: ccData.error?.message || 'Failed to fetch' };
        }
      } catch (error: any) {
        console.error('[CONVERSION_OPTIONS] Custom conversions error:', error.message);
        debug.customConversions = { error: error.message };
      }
    } else {
      debug.customConversions = { skipped: 'No adAccountId provided' };
    }

    // 3. CUSTOM EVENT NAMES (pixel events recently seen)
    let customEventNames: string[] = [];

    try {
      // Try to get recent events from the pixel
      const eventsUrl = `https://graph.facebook.com/v21.0/${pixelId}/events?fields=event_name&limit=100&access_token=${accessToken}`;
      const eventsResponse = await fetch(eventsUrl);
      const eventsData = await eventsResponse.json();

      if (eventsResponse.ok && eventsData.data) {
        // Extract unique event names
        const eventNames = new Set<string>();
        eventsData.data.forEach((event: any) => {
          if (event.event_name) {
            eventNames.add(event.event_name);
          }
        });

        customEventNames = Array.from(eventNames);

        // Sort: SmartLink events first, then alphabetically
        customEventNames.sort((a, b) => {
          const aIsSmartLink = a.toLowerCase().includes('smartlink');
          const bIsSmartLink = b.toLowerCase().includes('smartlink');

          if (aIsSmartLink && !bIsSmartLink) return -1;
          if (!aIsSmartLink && bIsSmartLink) return 1;
          return a.localeCompare(b);
        });

        debug.pixelEvents = {
          total: eventsData.data.length,
          unique: customEventNames.length,
        };
      } else {
        // Fallback to known Ghoste custom events if API not accessible
        customEventNames = [...GHOSTE_CUSTOM_EVENTS];
        debug.pixelEvents = {
          fallback: true,
          error: eventsData.error?.message || 'Using fallback list',
        };
      }
    } catch (error: any) {
      console.error('[CONVERSION_OPTIONS] Pixel events error:', error.message);
      // Fallback to known Ghoste custom events
      customEventNames = [...GHOSTE_CUSTOM_EVENTS];
      debug.pixelEvents = {
        fallback: true,
        error: error.message,
      };
    }

    // Remove duplicates between custom events and standard events
    customEventNames = customEventNames.filter(
      name => !standardEvents.includes(name)
    );

    // 4. RECOMMENDED LIST
    const recommended: string[] = [];

    // Prioritize SmartLinkOutbound
    if (customEventNames.includes('SmartLinkOutbound')) {
      recommended.push('SmartLinkOutbound');
    } else if (customConversions.some(cc => cc.name.includes('SmartLink'))) {
      const smartLinkCC = customConversions.find(cc => cc.name.includes('SmartLink'));
      if (smartLinkCC) {
        recommended.push(smartLinkCC.name);
      }
    }

    // Add common conversion events
    if (standardEvents.includes('Lead')) recommended.push('Lead');
    if (standardEvents.includes('Purchase')) recommended.push('Purchase');

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        standardEvents,
        customEventNames,
        customConversions,
        recommended,
        debug,
      }),
    };
  } catch (error: any) {
    console.error('[CONVERSION_OPTIONS] Error:', error.message);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch conversion options',
        standardEvents: STANDARD_EVENTS,
        customEventNames: GHOSTE_CUSTOM_EVENTS,
        customConversions: [],
        recommended: ['SmartLinkOutbound', 'Lead', 'Purchase'],
      }),
    };
  }
};
