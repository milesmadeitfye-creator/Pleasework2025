import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';
import { AutomationEventLogger } from './_automationEvents';

const SITE_URL = 'https://ghoste.one';

/**
 * Detect platform from URL and return the appropriate field mapping
 */
function detectPlatformFromUrl(url: string): { field: string; url: string } | null {
  const urlLower = url.toLowerCase();

  if (urlLower.includes('spotify.com') || urlLower.includes('open.spotify')) {
    return { field: 'spotify_url', url };
  }
  if (urlLower.includes('music.apple.com') || urlLower.includes('itunes.apple.com')) {
    return { field: 'apple_music_url', url };
  }
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return { field: 'youtube_url', url };
  }
  if (urlLower.includes('tidal.com')) {
    return { field: 'tidal_url', url };
  }
  if (urlLower.includes('soundcloud.com')) {
    return { field: 'soundcloud_url', url };
  }

  // Unknown platform - use as spotify by default
  return { field: 'spotify_url', url };
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log('[link-create] Handler invoked', {
    method: event.httpMethod
  });

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[link-create] Auth error:', authError);
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const {
      title,
      slug,
      cover_image_url,
      spotify_url,
      apple_music_url,
      youtube_url,
      tidal_url,
      soundcloud_url,
      url, // Single URL that needs platform detection
      template,
      color_scheme,
    } = body;

    if (!title) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'Title is required',
          reply: 'I need a title for the smart link. What should we call it?',
        }),
      };
    }

    let finalSlug = slug || title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // IMPORTANT: Use 'smart_links' table (public /s/:slug route uses this)
    const { data: existingLink } = await supabase
      .from('smart_links')
      .select('id')
      .eq('slug', finalSlug)
      .maybeSingle();

    if (existingLink) {
      finalSlug = `${finalSlug}-${Date.now()}`;
    }

    // Auto-detect platform from single URL if provided
    let detectedPlatform: { field: string; url: string } | null = null;
    if (url && !spotify_url && !apple_music_url && !youtube_url && !tidal_url && !soundcloud_url) {
      detectedPlatform = detectPlatformFromUrl(url);
      console.log('[link-create] Auto-detected platform:', detectedPlatform);
    }

    // IMPORTANT: Use 'smart_links' table schema (public /s/:slug route expects this)
    const linkData: any = {
      user_id: user.id,
      title,
      slug: finalSlug,
      cover_image_url: cover_image_url || '',
      spotify_url: spotify_url || (detectedPlatform?.field === 'spotify_url' ? detectedPlatform.url : ''),
      apple_music_url: apple_music_url || (detectedPlatform?.field === 'apple_music_url' ? detectedPlatform.url : ''),
      youtube_url: youtube_url || (detectedPlatform?.field === 'youtube_url' ? detectedPlatform.url : ''),
      tidal_url: tidal_url || (detectedPlatform?.field === 'tidal_url' ? detectedPlatform.url : ''),
      soundcloud_url: soundcloud_url || (detectedPlatform?.field === 'soundcloud_url' ? detectedPlatform.url : ''),
      template: template || 'modern',
      color_scheme: color_scheme || { primary: '#3B82F6', secondary: '#1E40AF', background: '#000000', text: '#FFFFFF' },
      is_active: true,
      total_clicks: 0,
    };

    // IMPORTANT: Use 'smart_links' table (public /s/:slug route queries this)
    const { data: newLink, error: insertError } = await supabase
      .from('smart_links')
      .insert([linkData])
      .select()
      .single();

    if (insertError) {
      console.error('[link-create] Insert error:', insertError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: insertError.message,
          reply: 'I tried to create the smart link but the database request failed. You can create one manually in the Links tab.',
        }),
      };
    }

    console.log('[link-create] Link created:', finalSlug);

    // Log automation event (triggers email decider)
    await AutomationEventLogger.smartlinkCreated(user.id, newLink.id).catch(err => {
      console.error('[link-create] Failed to log automation event:', err);
    });

    // Use /s/:slug route (matches public smart link landing page)
    const publicUrl = `${SITE_URL}/s/${finalSlug}`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        reply: `Done! I created a smart link called "${title}". You can share it at ${publicUrl}`,
        message: `Smart link "${title}" created successfully!`,
        data: {
          ...newLink,
          public_url: publicUrl,
        },
      }),
    };
  } catch (error: any) {
    console.error('[link-create] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
        reply: 'Creating the smart link failed unexpectedly. You can try again or create one manually in the Links tab.',
      }),
    };
  }
};
