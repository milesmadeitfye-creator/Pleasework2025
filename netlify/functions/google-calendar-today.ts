/**
 * Google Calendar Today's Events
 *
 * Fetches today's calendar events from Google Calendar using tokens stored in google_calendar_tokens
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const handler: Handler = async (event) => {
  try {
    // Get user from auth header
    const authHeader = event.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connected: false, events: [], error: 'Not authenticated' }),
      };
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connected: false, events: [], error: 'Invalid user' }),
      };
    }

    // Fetch calendar tokens from google_calendar_tokens table
    const { data: tokenData, error: tokenError } = await supabase
      .from('google_calendar_tokens')
      .select('access_token, refresh_token, expiry_date')
      .eq('user_id', user.id)
      .maybeSingle();

    if (tokenError || !tokenData || !tokenData.access_token) {
      console.log('[google-calendar-today] No calendar tokens found for user:', user.id);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connected: false, events: [] }),
      };
    }

    // Setup OAuth2 client
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('[google-calendar-today] Missing Google OAuth credentials');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connected: false, events: [], error: 'Google Calendar not configured' }),
      };
    }

    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      `${process.env.URL}/.netlify/functions/gcal-callback`
    );

    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expiry_date ? new Date(tokenData.expiry_date).getTime() : undefined,
    });

    // Setup Calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Get today's date range
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const timeMin = startOfDay.toISOString();
    const timeMax = endOfDay.toISOString();

    console.log('[google-calendar-today] Fetching events for user:', user.id, 'range:', timeMin, '-', timeMax);

    // Fetch events with automatic token refresh
    let response;
    try {
      response = await calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 10,
      });
    } catch (err: any) {
      // If token is expired and we have a refresh token, the Google client should auto-refresh
      // But let's explicitly save any refreshed credentials
      if (err.code === 401 && tokenData.refresh_token) {
        console.log('[google-calendar-today] Token expired, attempting refresh...');

        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          oauth2Client.setCredentials(credentials);

          // Save new access token
          await supabase
            .from('google_calendar_tokens')
            .update({
              access_token: credentials.access_token,
              expiry_date: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id);

          console.log('[google-calendar-today] Token refreshed successfully');

          // Retry the request
          response = await calendar.events.list({
            calendarId: 'primary',
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 10,
          });
        } catch (refreshErr: any) {
          console.error('[google-calendar-today] Token refresh failed:', refreshErr);
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              connected: false,
              events: [],
              error: 'Calendar authentication expired. Please reconnect.'
            }),
          };
        }
      } else {
        throw err;
      }
    }

    const events = (response.data.items || []).map((event) => ({
      id: event.id || '',
      summary: event.summary || 'Untitled event',
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      htmlLink: event.htmlLink || '',
    }));

    console.log('[google-calendar-today] Found', events.length, 'events');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connected: true,
        events,
      }),
    };
  } catch (err: any) {
    console.error('[google-calendar-today] Error:', err);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connected: false,
        events: [],
        error: err.message || 'Failed to fetch calendar events'
      }),
    };
  }
};
