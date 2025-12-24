import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_supabaseAdmin';

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Create a calendar event (called by Ghoste AI tools)
 * This is a wrapper around ai-calendar-create for tool calling
 */

interface CreateEventRequest {
  userId: string;
  title: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
  timezone?: string;
  allDay?: boolean;
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
    const payload: CreateEventRequest = JSON.parse(event.body || '{}');

    const {
      userId,
      title,
      description,
      location,
      startIso,
      endIso,
      timezone = 'UTC',
      allDay = false,
    } = payload;

    console.log('[calendarCreateEvent] Creating event:', { userId, title, startIso, endIso });

    // Validate required fields
    if (!userId || !title || !startIso || !endIso) {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          error: 'Missing required fields: userId, title, startIso, endIso',
        }),
      };
    }

    // Validate ISO timestamps
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          error: 'Invalid ISO timestamp format',
        }),
      };
    }

    // Calculate duration in minutes
    const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000) || 30;

    // Create calendar event in ai_calendar_events (for AI tracking)
    const { data: eventRecord, error } = await supabaseAdmin
      .from('ai_calendar_events')
      .insert({
        user_id: userId,
        title,
        description: description || null,
        start_at: startIso,
        end_at: endIso,
        reminder_minutes_before: 60,
        channel: 'email',
        status: 'scheduled',
      })
      .select('*')
      .single();

    if (error) {
      console.error('[calendarCreateEvent] Database error:', error);
      return {
        statusCode: 500,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          error: 'Failed to create calendar event',
          details: error.message,
        }),
      };
    }

    console.log('[calendarCreateEvent] ✅ Created event in ai_calendar_events:', eventRecord.id);

    // ALSO write to tasks table so it shows in the Calendar UI
    const { error: taskError } = await supabaseAdmin
      .from('tasks')
      .insert({
        user_id: userId,
        title,
        description: description || location || null,
        status: 'pending',
        due_at: startIso,
        reminder_channel: 'email',
        reminder_minutes_before: 60,
      });

    if (taskError) {
      console.error('[calendarCreateEvent] ⚠️ Failed to write to tasks:', taskError);
      // Don't fail the whole request - event is still in ai_calendar_events
    } else {
      console.log('[calendarCreateEvent] ✅ Also created in tasks table for Calendar UI');
    }

    // Format response
    const startAtFormatted = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(eventRecord.start_at));

    // Create notification
    try {
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: userId,
          type: 'ai_calendar',
          title: 'Event scheduled',
          message: `"${eventRecord.title}" scheduled for ${startAtFormatted}`,
          entity_type: 'ai_calendar',
          entity_id: eventRecord.id,
          data: { start_at: eventRecord.start_at },
        });
    } catch (err) {
      console.error('[calendarCreateEvent] Notification error:', err);
    }

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        ok: true,
        eventId: eventRecord.id,
        event: {
          id: eventRecord.id,
          title: eventRecord.title,
          description: eventRecord.description,
          start_at: eventRecord.start_at,
          end_at: eventRecord.end_at,
          formatted_start: startAtFormatted,
        },
        message: `Calendar event created: "${eventRecord.title}" on ${startAtFormatted}`,
      }),
    };
  } catch (err: any) {
    console.error('[calendarCreateEvent] Error:', err);
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
