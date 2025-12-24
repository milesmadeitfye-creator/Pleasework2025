import type { Handler } from "@netlify/functions";
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

const PUBLIC_LINK_DOMAIN =
  process.env.PUBLIC_LINK_DOMAIN || 'https://ghoste.one';
const PUBLIC_EMAIL_CAPTURE_PATH =
  process.env.PUBLIC_EMAIL_CAPTURE_PATH || '/capture';

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[email_capture_links] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY'
  );
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
        .from('email_capture_links')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[email_capture_links] fetch error:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Failed to fetch email capture links',
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
        public_url: `${PUBLIC_LINK_DOMAIN}${PUBLIC_EMAIL_CAPTURE_PATH}/${row.slug}`,
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

      // Extract only the fields we need (explicit whitelist)
      const user_id = parsed.user_id;
      const title = parsed.title;
      const slug = parsed.slug;
      const imagePath = parsed.imagePath || null; // Optional banner image path

      if (!user_id || !title || !slug) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'user_id, title, and slug are required',
          }),
        };
      }

      // Construct explicit insert payload (no spreading of external data)
      // image_path is optional and can be null
      const insertPayload = {
        user_id: user_id,
        title: title,
        slug: slug,
        image_path: imagePath, // null is fine - banner is optional
      };

      console.log('EMAIL_CAPTURE_INSERT', insertPayload);

      const { data, error } = await supabase
        .from('email_capture_links')
        .insert([insertPayload])
        .select()
        .single();

      if (error) {
        console.error('[email_capture_links] insert error:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: `Failed to create email capture link: ${error.message}`,
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
        public_url: `${PUBLIC_LINK_DOMAIN}${PUBLIC_EMAIL_CAPTURE_PATH}/${data.slug}`,
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
    console.error('[email_capture_links] unhandled error:', err);
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
