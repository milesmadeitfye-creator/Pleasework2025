import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_supabaseAdmin';

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { userId, startIso, endIso } = payload;

    if (!userId) {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: 'Missing userId' }),
      };
    }

    let query = supabaseAdmin
      .from('ai_calendar_events')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'scheduled');

    // If date range provided, filter by it
    if (startIso && endIso) {
      query = query.gte('start_at', startIso).lte('start_at', endIso);
    } else {
      // Default: get future events only
      const now = new Date().toISOString();
      query = query.gte('start_at', now).limit(20);
    }

    const { data: events, error } = await query.order('start_at', { ascending: true });

    if (error) {
      console.error('[ai-calendar-list] Database error:', error);
      return {
        statusCode: 500,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          error: 'Failed to fetch calendar events',
          details: error.message,
        }),
      };
    }

    console.log('[ai-calendar-list] Found', events?.length || 0, 'events for user:', userId);

    // Format events for display
    const formattedEvents = (events || []).map((event) => {
      const startAt = new Date(event.start_at);
      const startAtFormatted = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(startAt);

      return {
        id: event.id,
        title: event.title,
        description: event.description,
        start_at: event.start_at,
        start_at_formatted: startAtFormatted,
        reminder_minutes_before: event.reminder_minutes_before,
        channel: event.channel,
      };
    });

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        success: true,
        count: formattedEvents.length,
        events: formattedEvents,
      }),
    };
  } catch (err: any) {
    console.error('[ai-calendar-list] Error:', err);
    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        error: 'Failed to list calendar events',
        details: err.message || String(err),
      }),
    };
  }
};
