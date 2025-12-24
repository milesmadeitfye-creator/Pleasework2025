import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_supabaseAdmin';

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * List calendar events for a week (called by Ghoste AI tools)
 * This is a wrapper around ai-calendar-list for tool calling
 */

interface ListWeekRequest {
  userId: string;
  startIso: string;
  endIso: string;
}

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
    const payload: ListWeekRequest = JSON.parse(event.body || '{}');
    const { userId, startIso, endIso } = payload;

    console.log('[calendarListWeek] Fetching events:', { userId, startIso, endIso });

    if (!userId || !startIso || !endIso) {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: 'Missing userId, startIso, or endIso' }),
      };
    }

    // Fetch events in date range
    const { data: events, error } = await supabaseAdmin
      .from('ai_calendar_events')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'scheduled')
      .gte('start_at', startIso)
      .lte('start_at', endIso)
      .order('start_at', { ascending: true });

    if (error) {
      console.error('[calendarListWeek] Database error:', error);
      return {
        statusCode: 500,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          error: 'Failed to fetch calendar events',
          details: error.message,
        }),
      };
    }

    console.log('[calendarListWeek] ✅ Found', events?.length || 0, 'events');

    // Format events for display
    const formattedEvents = (events || []).map((event) => {
      const startAt = new Date(event.start_at);
      const endAt = event.end_at ? new Date(event.end_at) : null;

      const startAtFormatted = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(startAt);

      const timeRange = endAt
        ? `${startAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${endAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
        : startAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

      return {
        id: event.id,
        title: event.title,
        description: event.description,
        start_at: event.start_at,
        end_at: event.end_at,
        formatted_start: startAtFormatted,
        time_range: timeRange,
      };
    });

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        ok: true,
        count: formattedEvents.length,
        events: formattedEvents,
      }),
    };
  } catch (err: any) {
    console.error('[calendarListWeek] Error:', err);
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
