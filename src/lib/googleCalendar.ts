import { getGoogleTokens } from './googleAuth';

interface CalendarItem {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole?: string;
}

interface CalendarEvent {
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{
      method: string;
      minutes: number;
    }>;
  };
}

export type GhosteCalendarEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  htmlLink?: string;
  location?: string | null;
  source: 'calendar';
};

interface CreateProgressEventParams {
  calendarId: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  timeZone?: string;
}

/**
 * Lists all Google Calendars for the authenticated user
 */
export async function listCalendars(): Promise<CalendarItem[]> {
  try {
    const { accessToken, supabaseJwt } = await getGoogleTokens();

    if (!accessToken || !supabaseJwt) {
      throw new Error('Not authenticated with Google');
    }

    const response = await fetch('/.netlify/functions/google-calendar-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseJwt}`,
      },
      body: JSON.stringify({ accessToken }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.details || 'Failed to fetch calendars');
    }

    const data = await response.json();
    return data.calendars || [];
  } catch (error: any) {
    console.error('[listCalendars] Error:', error);
    throw error;
  }
}

/**
 * Creates a progress/reminder event in Google Calendar
 */
export async function createProgressEvent(params: CreateProgressEventParams): Promise<any> {
  try {
    const { accessToken, supabaseJwt } = await getGoogleTokens();

    if (!accessToken || !supabaseJwt) {
      throw new Error('Not authenticated with Google');
    }

    const { calendarId, summary, description, start, end, timeZone } = params;

    const event: CalendarEvent = {
      summary,
      description: description || '',
      start: {
        dateTime: start,
        timeZone: timeZone || 'America/New_York',
      },
      end: {
        dateTime: end,
        timeZone: timeZone || 'America/New_York',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 60 },
        ],
      },
    };

    const response = await fetch('/.netlify/functions/google-calendar-create-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseJwt}`,
      },
      body: JSON.stringify({
        accessToken,
        calendarId,
        event,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.details || 'Failed to create event');
    }

    const data = await response.json();
    return data.event;
  } catch (error: any) {
    console.error('[createProgressEvent] Error:', error);
    throw error;
  }
}

/**
 * Creates a generic calendar event
 */
export async function createCalendarEvent(
  calendarId: string,
  event: CalendarEvent
): Promise<any> {
  try {
    const { accessToken, supabaseJwt } = await getGoogleTokens();

    if (!accessToken || !supabaseJwt) {
      throw new Error('Not authenticated with Google');
    }

    const response = await fetch('/.netlify/functions/google-calendar-create-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseJwt}`,
      },
      body: JSON.stringify({
        accessToken,
        calendarId,
        event,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.details || 'Failed to create event');
    }

    const data = await response.json();
    return data.event;
  } catch (error: any) {
    console.error('[createCalendarEvent] Error:', error);
    throw error;
  }
}

/**
 * Fetches upcoming events from Google Calendar
 */
export async function fetchUpcomingEvents(
  calendarId: string = 'primary',
  daysAhead: number = 7
): Promise<GhosteCalendarEvent[]> {
  try {
    const { accessToken, supabaseJwt } = await getGoogleTokens();

    if (!accessToken || !supabaseJwt) {
      console.warn('[fetchUpcomingEvents] Not authenticated with Google');
      return [];
    }

    const now = new Date();
    const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const timeMin = now.toISOString();
    const timeMax = future.toISOString();

    const response = await fetch('/.netlify/functions/google-calendar-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseJwt}`,
      },
      body: JSON.stringify({
        accessToken,
        calendarId,
        timeMin,
        timeMax,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[fetchUpcomingEvents] Error:', error);
      return [];
    }

    const data = await response.json();
    const events = (data.events || []).map((event: any) => ({
      ...event,
      source: 'calendar' as const,
    }));

    return events;
  } catch (error: any) {
    console.error('[fetchUpcomingEvents] Error:', error);
    return [];
  }
}
