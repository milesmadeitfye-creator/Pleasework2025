import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
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

export const handler: Handler = async (event) => {
  console.log('[mailchimp-create-tag] Request received');

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
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[mailchimp-create-tag] Missing authorization header');
      return jsonResponse(401, { error: 'UNAUTHORIZED' });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[mailchimp-create-tag] Auth verification failed', authError);
      return jsonResponse(401, { error: 'INVALID_TOKEN' });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { list_id, name } = body;

    if (!list_id || !name) {
      return jsonResponse(400, {
        success: false,
        error: 'MISSING_FIELDS',
        message: 'list_id and name are required',
      });
    }

    console.log('[mailchimp-create-tag] User verified', {
      userId: user.id.substring(0, 8) + '...',
      listId: list_id,
      tagName: name,
    });

    // Load user's Mailchimp connection
    const { data: connections, error: connError } = await supabase
      .from('mailchimp_connections')
      .select('*')
      .eq('user_id', user.id)
      .limit(1);

    if (connError) {
      console.error('[mailchimp-create-tag] Database error', connError);
      return jsonResponse(500, { error: 'DATABASE_ERROR' });
    }

    if (!connections || connections.length === 0 || !connections[0].access_token) {
      return jsonResponse(400, {
        success: false,
        error: 'MAILCHIMP_NOT_CONNECTED',
        message: 'Please connect your Mailchimp account first',
      });
    }

    const connection = connections[0];
    const accessToken = connection.access_token;
    const serverPrefix =
      connection.server_prefix ||
      connection.data_center ||
      connection.dc ||
      'us13';

    // Create a static segment (tag) in Mailchimp
    const segmentsUrl = `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${list_id}/segments`;

    console.log('[mailchimp-create-tag] Creating segment in Mailchimp', {
      url: segmentsUrl,
      name,
    });

    const createRes = await fetch(segmentsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name,
        static_segment: [], // Empty static segment (tag)
      }),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error('[mailchimp-create-tag] Mailchimp API error', {
        status: createRes.status,
        error: errorData,
      });

      // Check if tag already exists
      if (createRes.status === 400 && errorText.includes('already exists')) {
        // Tag exists, just save to our database
        const { error: upsertError } = await supabase
          .from('mailchimp_tags')
          .upsert(
            {
              user_id: user.id,
              list_id,
              name,
            },
            { onConflict: 'user_id,list_id,name' }
          );

        if (upsertError) {
          console.error('[mailchimp-create-tag] Failed to upsert tag', upsertError);
        }

        return jsonResponse(200, {
          success: true,
          tag: { user_id: user.id, list_id, name },
          message: 'Tag already exists in Mailchimp',
        });
      }

      return jsonResponse(500, {
        success: false,
        error: 'MAILCHIMP_API_ERROR',
        message: errorData.title || errorData.message || 'Failed to create tag in Mailchimp',
        details: errorData,
      });
    }

    const createdSegment: any = await createRes.json();

    console.log('[mailchimp-create-tag] Segment created successfully', {
      segmentId: createdSegment.id,
    });

    // Upsert tag into mailchimp_tags table
    const { error: upsertError } = await supabase
      .from('mailchimp_tags')
      .upsert(
        {
          user_id: user.id,
          list_id,
          name,
        },
        { onConflict: 'user_id,list_id,name' }
      );

    if (upsertError) {
      console.error('[mailchimp-create-tag] Failed to upsert tag', upsertError);
      return jsonResponse(500, {
        success: false,
        error: 'DATABASE_UPSERT_ERROR',
        message: 'Failed to save tag to database',
      });
    }

    console.log('[mailchimp-create-tag] Tag created and saved successfully');

    return jsonResponse(200, {
      success: true,
      tag: {
        user_id: user.id,
        list_id,
        name,
      },
    });
  } catch (err: any) {
    console.error('[mailchimp-create-tag] Unexpected error', err);
    return jsonResponse(500, {
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    });
  }
};

export default handler;
