import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_supabaseAdmin';

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface CreateCalendarEventRequest {
  userId: string;
  title: string;
  description?: string;
  start_at_iso: string;
  end_at_iso?: string | null;
  reminder_minutes_before?: number;
  channel?: 'email' | 'sms' | 'both';
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
    const payload: CreateCalendarEventRequest = JSON.parse(event.body || '{}');

    const {
      userId,
      title,
      description,
      start_at_iso,
      end_at_iso,
      reminder_minutes_before = 60,
      channel = 'email',
    } = payload;

    // Validate required fields
    if (!userId || !title || !start_at_iso) {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          error: 'Missing required fields: userId, title, start_at_iso',
        }),
      };
    }

    // Validate ISO timestamp
    const startDate = new Date(start_at_iso);
    if (isNaN(startDate.getTime())) {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          error: 'Invalid start_at_iso timestamp',
        }),
      };
    }

    // Create calendar event
    const { data: eventRecord, error } = await supabaseAdmin
      .from('ai_calendar_events')
      .insert({
        user_id: userId,
        title,
        description: description || null,
        start_at: start_at_iso,
        end_at: end_at_iso || null,
        reminder_minutes_before,
        channel,
        status: 'scheduled',
      })
      .select('*')
      .single();

    if (error) {
      console.error('[ai-calendar-create] Database error:', error);
      return {
        statusCode: 500,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          error: 'Failed to create calendar event',
          details: error.message,
        }),
      };
    }

    console.log('[ai-calendar-create] Created event:', eventRecord.id, eventRecord.title);

    // Format response for Ghoste AI
    const startAtFormatted = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(eventRecord.start_at));

    // Send notification (inline to avoid heavy import)
    try {
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: userId,
          type: 'ai_calendar',
          title: 'Reminder scheduled',
          message: `I'll remind you about "${eventRecord.title}" at ${startAtFormatted}.`,
          entity_type: 'ai_calendar',
          entity_id: eventRecord.id,
          data: { start_at: eventRecord.start_at },
        });
    } catch (err) {
      console.error('[ai-calendar-create] notification error:', err);
    }

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        success: true,
        event: {
          id: eventRecord.id,
          title: eventRecord.title,
          description: eventRecord.description,
          start_at: eventRecord.start_at,
          start_at_formatted: startAtFormatted,
          end_at: eventRecord.end_at,
          reminder_minutes_before: eventRecord.reminder_minutes_before,
          channel: eventRecord.channel,
        },
        message: `Calendar event created: "${eventRecord.title}" on ${startAtFormatted}. You'll receive a reminder ${eventRecord.reminder_minutes_before} minutes before.`,
      }),
    };
  } catch (err: any) {
    console.error('[ai-calendar-create] Error:', err);
    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        error: 'Failed to create calendar event',
        details: err.message || String(err),
      }),
    };
  }
};
