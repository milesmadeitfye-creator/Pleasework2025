import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_supabaseAdmin';

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!event.body) {
    return json(400, { error: 'Missing body' });
  }

  try {
    const body = JSON.parse(event.body);
    const userId = body.user_id || body.userId;
    if (!userId || typeof userId !== 'string') {
      return json(400, { error: 'Missing user_id' });
    }

    // Inline mark read logic (avoid import from src/server/notifications)

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .eq('user_id', userId);

    if (error) {
      console.error('[notifications-mark-read] error', error);
      return json(500, { error: 'Failed to mark notifications as read' });
    }

    return json(200, { ok: true });
  } catch (err: any) {
    console.error('[notifications-mark-read] exception', err);
    return json(500, { error: 'Failed to mark notifications as read' });
  }
};
