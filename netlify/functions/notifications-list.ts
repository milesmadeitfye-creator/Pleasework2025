import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_supabaseAdmin';
import { RESPONSE_HEADERS } from './_shared/headers';

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

  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const userId = event.queryStringParameters?.user_id;
  if (!userId) {
    return json(400, { error: 'Missing user_id' });
  }

  try {
    // Inline notification listing logic (avoid import from src/server/notifications)
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      // Log error but return empty array instead of 500
      console.error('[notifications-list] Database error (returning empty):', error.message);
      return json(200, { ok: true, notifications: [], unreadCount: 0 });
    }

    if (!data) {
      console.warn('[notifications-list] No data returned (returning empty)');
      return json(200, { ok: true, notifications: [], unreadCount: 0 });
    }

    const unreadCount = data.filter((n) => !n.read_at).length;

    return json(200, { ok: true, notifications: data, unreadCount });
  } catch (err: any) {
    // Never return 500 - just log and return empty
    console.error('[notifications-list] Exception (returning empty):', err.message || String(err));
    return json(200, { ok: true, notifications: [], unreadCount: 0 });
  }
};
