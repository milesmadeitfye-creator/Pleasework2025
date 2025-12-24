/**
 * Google Calendar Sync Utility
 *
 * Provides robust Google Calendar integration with:
 * - Token retrieval from Supabase
 * - Event creation with detailed error logging
 * - Silent fallback when user not connected
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TOKENS_TABLE = 'google_calendar_tokens';
const CALENDAR_TABLE = 'tasks';

export type GoogleTokens = {
  access_token: string;
  refresh_token: string | null;
  expiry_date: string | null;
  scope?: string | null;
  token_type?: string | null;
};

export type GhosteCalendarEventInput = {
  title: string;
  description?: string;
  start_time: string; // ISO datetime
  end_time?: string;  // ISO datetime
  category?: string;
  color?: string;
  icon?: string;
};

/**
 * Get Google Calendar tokens for a user from Supabase
 * Returns null if user hasn't connected Google Calendar
 */
export async function getGoogleTokensForUser(
  userId: string
): Promise<GoogleTokens | null> {
  console.log('[google-sync] Looking up tokens for user:', userId);

  const { data, error } = await supabase
    .from(TOKENS_TABLE)
    .select('access_token, refresh_token, expiry_date, scope, token_type')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[google-sync] Token lookup error:', {
      userId,
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return null;
  }

  if (!data) {
    console.log('[google-sync] No tokens found for user:', userId);
    return null;
  }

  if (!data.access_token) {
    console.warn('[google-sync] Token row exists but access_token is null:', userId);
    return null;
  }

  console.log('[google-sync] Successfully retrieved tokens', {
    userId,
    hasAccessToken: !!data.access_token,
    hasRefreshToken: !!data.refresh_token,
    scope: data.scope,
    expiryDate: data.expiry_date,
  });

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: data.expiry_date,
    scope: data.scope,
    token_type: data.token_type,
  };
}

/**
 * Create events in Google Calendar for a user
 * Silently falls back if user hasn't connected Google Calendar
 * Logs all API errors for debugging
 */
export async function createGoogleCalendarEventsForUser(params: {
  userId: string;
  events: GhosteCalendarEventInput[];
}): Promise<void> {
  const { userId, events } = params;

  if (!events || events.length === 0) {
    console.log('[google-sync] No events to sync for user:', userId);
    return;
  }

  console.log('[google-sync] Starting sync for user:', userId, 'events:', events.length);

  // Get tokens from Supabase
  const tokens = await getGoogleTokensForUser(userId);
  if (!tokens) {
    console.log('[google-sync] User not connected to Google Calendar, skipping sync');
    return;
  }

  const accessToken = tokens.access_token;

  console.log('[google-sync] Syncing events to Google Calendar...', {
    userId,
    eventsCount: events.length,
    eventTitles: events.map(e => e.title),
  });

  let successCount = 0;
  let errorCount = 0;

  for (const event of events) {
    try {
      const body = {
        summary: event.title,
        description: event.description ?? undefined,
        start: {
          dateTime: event.start_time,
          timeZone: 'UTC',
        },
        end: {
          dateTime: event.end_time ?? event.start_time,
          timeZone: 'UTC',
        },
      };

      console.log('[google-sync] Creating event in Google Calendar:', {
        title: event.title,
        startTime: event.start_time,
      });

      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        let errorJson: any = null;
        try {
          errorJson = JSON.parse(text);
        } catch {
          errorJson = { rawError: text };
        }

        console.error('[google-sync] ❌ Failed to create event in Google Calendar', {
          title: event.title,
          status: res.status,
          statusText: res.statusText,
          error: errorJson,
        });

        errorCount++;
      } else {
        const json = await res.json();
        console.log('[google-sync] ✅ Successfully created event in Google Calendar', {
          title: event.title,
          googleEventId: json.id,
          htmlLink: json.htmlLink,
        });
        successCount++;
      }
    } catch (err: any) {
      console.error('[google-sync] ❌ Exception while creating event', {
        title: event.title,
        error: err.message || String(err),
        stack: err.stack,
      });
      errorCount++;
    }
  }

  console.log('[google-sync] Sync completed', {
    userId,
    totalEvents: events.length,
    successCount,
    errorCount,
  });
}

/**
 * Check if a user has Google Calendar connected
 */
export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const tokens = await getGoogleTokensForUser(userId);
  return tokens !== null;
}
