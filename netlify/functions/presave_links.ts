import type { Handler } from "@netlify/functions";
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const PUBLIC_LINK_DOMAIN = process.env.PUBLIC_LINK_DOMAIN || 'https://ghoste.one';
const PUBLIC_PRESAVE_PATH = process.env.PUBLIC_PRESAVE_PATH || '/p';

if (!supabaseUrl || !supabaseKey) {
  console.error('[presave_links] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const userId =
        event.queryStringParameters && event.queryStringParameters.user_id;

      if (!userId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing user_id parameter' }),
        };
      }

      const { data, error } = await supabase
        .from('presave_links')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[presave_links] fetch error:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Failed to fetch presave links',
            supabase_error: {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint,
            },
          }),
        };
      }

      const links = (data || []).map((row) => ({
        ...row,
        public_url: `${PUBLIC_LINK_DOMAIN}${PUBLIC_PRESAVE_PATH}/${row.slug}`,
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ links }),
      };
    }

    if (event.httpMethod === 'POST') {
      if (!event.body) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing request body' }),
        };
      }

      const parsed = JSON.parse(event.body);
      const {
        user_id,
        slug,
        song_title,
        artist_name,
        release_date,
        cover_art_url,
        cover_art_path,
      } = parsed;

      if (!user_id || !slug || !song_title || !artist_name || !release_date) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error:
              'user_id, slug, song_title, artist_name, and release_date are required',
          }),
        };
      }

      // Generate public URL from cover_art_path if provided
      let finalCoverArtUrl = cover_art_url || null;
      if (cover_art_path && !finalCoverArtUrl) {
        const { data: urlData } = supabase.storage
          .from('presave-images')
          .getPublicUrl(cover_art_path);
        finalCoverArtUrl = urlData.publicUrl;
      }

      const { data, error} = await supabase
        .from('presave_links')
        .insert([{
          user_id,
          slug,
          song_title,
          artist_name,
          release_date,
          cover_art_url: finalCoverArtUrl,
          cover_art_path: cover_art_path || null,
        }])
        .select()
        .single();

      if (error) {
        console.error('[presave_links] insert error:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: `Failed to create presave link: ${error.message}`,
            supabase_error: {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint,
            },
          }),
        };
      }

      const linkWithUrl = {
        ...data,
        public_url: `${PUBLIC_LINK_DOMAIN}${PUBLIC_PRESAVE_PATH}/${data.slug}`,
      };

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ link: linkWithUrl }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (err: any) {
    console.error('[presave_links] unhandled error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Unhandled server error',
        supabase_error: {
          message: err && err.message,
        },
      }),
    };
  }
};
