import { HandlerEvent } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';
import { sendCapi } from './_capi';
import { getMetaConfig } from './_metaConfig';

export type OneClickPlatform =
  | 'spotify'
  | 'applemusic'
  | 'youtube'
  | 'amazonmusic'
  | 'tidal'
  | 'deezer'
  | 'soundcloud'
  | 'audiomack'
  | 'web'
  | 'other';

export function normalizePlatform(platform: string | null | undefined): OneClickPlatform {
  if (!platform) return 'other';

  const lower = platform.toLowerCase().replace(/[_\s-]/g, '');

  if (lower.includes('spotify')) return 'spotify';
  if (lower.includes('apple')) return 'applemusic';
  if (lower.includes('youtube') || lower.includes('youtu')) return 'youtube';
  if (lower.includes('amazon')) return 'amazonmusic';
  if (lower.includes('tidal')) return 'tidal';
  if (lower.includes('deezer')) return 'deezer';
  if (lower.includes('soundcloud')) return 'soundcloud';
  if (lower.includes('audiomack')) return 'audiomack';

  return 'other';
}

export function detectPlatformFromUrl(url: string): OneClickPlatform {
  if (!url) return 'other';

  const lower = url.toLowerCase();

  if (lower.includes('spotify.com') || lower.startsWith('spotify:')) return 'spotify';
  if (lower.includes('music.apple.com')) return 'applemusic';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('music.amazon.com')) return 'amazonmusic';
  if (lower.includes('tidal.com')) return 'tidal';
  if (lower.includes('deezer.com')) return 'deezer';
  if (lower.includes('soundcloud.com')) return 'soundcloud';
  if (lower.includes('audiomack.com')) return 'audiomack';

  if (lower.startsWith('http://') || lower.startsWith('https://')) return 'web';

  return 'other';
}

export function buildPlatformEventName(platform: OneClickPlatform): string {
  return `oneclick${platform}`;
}

export interface OneClickEventPayload {
  link_id: string;
  slug?: string;
  short_code: string;
  owner_user_id: string;
  platform: OneClickPlatform;
  destination_url: string;
  event_source_url: string;
  referrer?: string;
  user_agent?: string;
  client_ip?: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  utm_content?: string;
  fbp?: string;
  fbc?: string;
}

export async function trackOneClickEvent(payload: OneClickEventPayload) {
  const supabase = getSupabaseAdmin();

  const baseEventName = 'oneclicklink';
  const platformEventName = buildPlatformEventName(payload.platform);

  console.log('[oneClickTracking] Tracking events:', {
    baseEvent: baseEventName,
    platformEvent: platformEventName,
    platform: payload.platform,
    linkId: payload.link_id,
    slug: payload.slug || payload.short_code
  });

  try {
    const baseEventData = {
      owner_user_id: payload.owner_user_id,
      link_id: payload.link_id,
      link_type: 'one_click' as const,
      event_name: baseEventName,
      event_family: 'one_click' as const,
      platform: payload.platform,
      slug: payload.slug || payload.short_code,
      url: payload.destination_url,
      referrer: payload.referrer || null,
      user_agent: payload.user_agent || null,
      metadata: {
        utm_source: payload.utm_source,
        utm_campaign: payload.utm_campaign,
        utm_medium: payload.utm_medium,
        utm_content: payload.utm_content,
        source: 'one_click_redirect',
      }
    };

    const platformEventData = {
      ...baseEventData,
      event_name: platformEventName,
    };

    const { error: baseError } = await supabase
      .from('link_click_events')
      .insert([baseEventData]);

    if (baseError) {
      console.error('[oneClickTracking] Error storing base event:', baseError);
    }

    const { error: platformError } = await supabase
      .from('link_click_events')
      .insert([platformEventData]);

    if (platformError) {
      console.error('[oneClickTracking] Error storing platform event:', platformError);
    }

    console.log('[oneClickTracking] ✅ Internal events stored');
  } catch (err) {
    console.error('[oneClickTracking] Internal tracking error:', err);
  }
}

export async function trackOneClickMetaPixel(payload: OneClickEventPayload) {
  try {
    const { META_PIXEL_ID, META_CONVERSIONS_TOKEN } = getMetaConfig();

    if (!META_CONVERSIONS_TOKEN || !META_PIXEL_ID) {
      console.warn('[oneClickTracking] Meta CAPI not configured, skipping pixel events');
      return;
    }

    const baseEventName = 'oneclicklink';
    const platformEventName = buildPlatformEventName(payload.platform);

    console.log('[oneClickTracking] Sending Meta CAPI events:', {
      pixelId: META_PIXEL_ID,
      baseEvent: baseEventName,
      platformEvent: platformEventName
    });

    const customData = {
      content_name: 'one_click_link',
      content_category: payload.platform,
      content_ids: [payload.link_id],
      platform: payload.platform,
      link_type: 'one_click',
      slug: payload.slug || payload.short_code,
      owner_user_id: payload.owner_user_id,
    };

    await sendCapi({
      pixelId: META_PIXEL_ID,
      accessToken: META_CONVERSIONS_TOKEN,
      eventName: baseEventName,
      eventSourceUrl: payload.event_source_url,
      clientIp: payload.client_ip,
      clientUa: payload.user_agent,
      fbp: payload.fbp,
      fbc: payload.fbc,
      externalId: payload.owner_user_id,
      customData,
    });

    await sendCapi({
      pixelId: META_PIXEL_ID,
      accessToken: META_CONVERSIONS_TOKEN,
      eventName: platformEventName,
      eventSourceUrl: payload.event_source_url,
      clientIp: payload.client_ip,
      clientUa: payload.user_agent,
      fbp: payload.fbp,
      fbc: payload.fbc,
      externalId: payload.owner_user_id,
      customData,
    });

    console.log('[oneClickTracking] ✅ Meta CAPI events sent');
  } catch (err) {
    console.error('[oneClickTracking] Meta CAPI error:', err);
  }
}

export function extractUtmParams(event: HandlerEvent) {
  const params = event.queryStringParameters || {};

  return {
    utm_source: params.utm_source || params.source,
    utm_campaign: params.utm_campaign || params.campaign,
    utm_medium: params.utm_medium || params.medium,
    utm_content: params.utm_content || params.content,
  };
}

export function extractMetaParams(event: HandlerEvent) {
  const cookies = event.headers.cookie || '';

  let fbp: string | undefined;
  let fbc: string | undefined;

  const cookiePairs = cookies.split(';').map(c => c.trim());
  for (const pair of cookiePairs) {
    const [key, value] = pair.split('=');
    if (key === '_fbp') fbp = value;
    if (key === '_fbc') fbc = value;
  }

  const params = event.queryStringParameters || {};
  if (params.fbclid && !fbc) {
    fbc = `fb.1.${Date.now()}.${params.fbclid}`;
  }

  return { fbp, fbc };
}

export function getClientIp(event: HandlerEvent): string | undefined {
  return event.headers['x-forwarded-for']?.split(',')[0].trim() ||
         event.headers['x-real-ip'] ||
         undefined;
}
