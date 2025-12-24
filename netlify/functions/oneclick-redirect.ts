import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

interface OneClickLinkRow {
  id: string;
  spotify_url?: string | null;
  apple_music_url?: string | null;
  youtube_url?: string | null;
  tidal_url?: string | null;
  soundcloud_url?: string | null;
  deezer_url?: string | null;
  audiomack_url?: string | null;
  target_url?: string | null;
  clicks?: number;
}

function buildDeepLink(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  try {
    const url = new URL(originalUrl);

    if (url.hostname.includes('open.spotify.com')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const type = parts[0];
      const id = parts[1]?.split('?')[0];

      if (type && id) {
        return `spotify://${type}/${id}`;
      }
    }

    if (
      url.hostname.includes('youtube.com') ||
      url.hostname.includes('youtu.be')
    ) {
      let videoId = '';

      if (url.hostname.includes('youtu.be')) {
        videoId = url.pathname.replace('/', '').split('?')[0];
      } else if (url.searchParams.has('v')) {
        videoId = url.searchParams.get('v') || '';
      }

      if (videoId) {
        return `vnd.youtube://${videoId}`;
      }
    }

    if (url.hostname.includes('music.apple.com')) {
      return originalUrl;
    }

    return originalUrl;
  } catch {
    return originalUrl;
  }
}

function selectBestUrl(link: OneClickLinkRow): string | null {
  if (link.target_url) {
    return link.target_url;
  }

  return link.spotify_url || link.apple_music_url || link.youtube_url ||
         link.tidal_url || link.soundcloud_url || link.deezer_url ||
         link.audiomack_url || null;
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  try {
    const supabase = getSupabaseAdmin();

    const shortCode = event.queryStringParameters?.code || '';

    console.log('[oneclick-redirect] Request received', {
      shortCode,
      path: event.path,
      userAgent: event.headers['user-agent']?.substring(0, 50)
    });

    if (!shortCode) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: 'Missing short code.',
      };
    }

    const { data: link, error } = await supabase
      .from('oneclick_links')
      .select('*')
      .eq('short_code', shortCode)
      .maybeSingle();

    if (error || !link) {
      console.error('[oneclick-redirect] Link not found:', shortCode, error);
      return {
        statusCode: 302,
        headers: {
          Location: 'https://ghoste.one',
        },
        body: '',
      };
    }

    await supabase
      .from('oneclick_links')
      .update({ clicks: (link.clicks || 0) + 1 })
      .eq('id', link.id);

    const targetUrl = (link.target_url as string) || (link.destination_url as string) || selectBestUrl(link) || '';

    if (!targetUrl) {
      console.log('[oneclick-redirect] No valid URL found');
      return {
        statusCode: 302,
        headers: {
          Location: 'https://ghoste.one',
        },
        body: '',
      };
    }

    const deepLinkUrl = buildDeepLink(targetUrl);

    if (!deepLinkUrl) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: 'Link is missing a target URL.',
      };
    }

    console.log('[oneclick-redirect] Redirecting to:', deepLinkUrl);

    return {
      statusCode: 302,
      headers: {
        Location: deepLinkUrl,
        'Cache-Control': 'no-store',
      },
      body: '',
    };
  } catch (error: any) {
    console.error('[oneclick-redirect] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'Internal server error',
    };
  }
};
