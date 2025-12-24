import type { Handler } from '@netlify/functions';
import { getSupabaseAdminClient } from './_supabaseAdmin';

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const supabase = getSupabaseAdminClient();

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    // Extract user ID from authorization header
    const authHeader = event.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: 'UNAUTHORIZED' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[ghoste-media-register] Auth error:', authError);
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: 'UNAUTHORIZED' }),
      };
    }

    const userId = user.id;

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { url, path, type, fileName, size } = body;

    if (!url || !path || !fileName || typeof size !== 'number') {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: 'MISSING_FIELDS' }),
      };
    }

    console.log('[ghoste-media-register] Registering media for user:', userId);
    console.log('[ghoste-media-register] File:', fileName, 'Type:', type);

    const mimeType =
      type === 'video' ? 'video/mp4' :
      type === 'image' ? 'image/jpeg' :
      type === 'audio' ? 'audio/mpeg' :
      'application/octet-stream';

    const bucket = path.split('/').length > 1 ? 'uploads' : 'uploads';

    // Insert into user_uploads table (new index for AI access)
    const { data: uploadRecord, error: uploadError } = await supabase
      .from('user_uploads')
      .insert({
        user_id: userId,
        kind: type === 'video' ? 'video' : type === 'image' ? 'image' : type === 'audio' ? 'audio' : 'document',
        filename: fileName,
        mime_type: mimeType,
        storage_bucket: bucket,
        storage_path: path,
        public_url: url,
      })
      .select()
      .maybeSingle();

    if (uploadError) {
      console.error('[ghoste-media-register] user_uploads insert error:', uploadError);
    } else {
      console.log('[ghoste-media-register] Created user_uploads record:', uploadRecord?.id);
    }

    // Insert into ghoste_media_assets table
    const { data, error } = await supabase
      .from('ghoste_media_assets')
      .insert({
        user_id: userId,
        url,
        path,
        media_type: type ?? 'unknown',
        file_name: fileName,
        file_size: size,
        usage_tags: ['ads', 'ghoste_ai'],
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error('[ghoste-media-register] Insert error:', error);
      return {
        statusCode: 500,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: 'INSERT_FAILED', details: error.message }),
      };
    }

    console.log('[ghoste-media-register] Successfully registered media:', data?.id);

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ ok: true, asset: data }),
    };
  } catch (err: any) {
    console.error('[ghoste-media-register] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: 'SERVER_ERROR', message: err.message }),
    };
  }
};
