/**
 * Google Calendar - Create Event
 *
 * Creates an event in the user's primary Google Calendar
 * Requires user to have connected Google Calendar first
 */

import { Handler } from '@netlify/functions';
import { getOAuthClient, getCalendarClient } from './_googleCalendarClient';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const authHeader = event.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not authenticated' }),
      };
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid user' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { summary, description, start, end, location } = body;

    if (!summary || !start || !end) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields: summary, start, end' }),
      };
    }

    // Fetch user's Google Calendar tokens
    const { data: tokenRow, error: tokenError } = await supabase
      .from('google_calendar_tokens')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      console.error('[gcal-create-event] No calendar tokens for user:', user.id);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Google Calendar not connected',
          message: 'Please connect your Google Calendar in Connected Accounts first',
        }),
      };
    }

    // Set up OAuth client with stored credentials
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({
      access_token: tokenRow.access_token,
      refresh_token: tokenRow.refresh_token,
      scope: tokenRow.scope,
      token_type: tokenRow.token_type,
      expiry_date: tokenRow.expiry_date ? new Date(tokenRow.expiry_date).getTime() : undefined,
    });

    // Check if token needs refresh
    const now = Date.now();
    const expiryTime = tokenRow.expiry_date ? new Date(tokenRow.expiry_date).getTime() : 0;

    if (expiryTime && now >= expiryTime) {
      console.log('[gcal-create-event] Token expired, refreshing...');
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);

      // Update tokens in database
      await supabase
        .from('google_calendar_tokens')
        .update({
          access_token: credentials.access_token,
          expiry_date: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
    }

    const calendar = getCalendarClient(oauth2Client);

    // Create the event
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        location,
        start: {
          dateTime: start,
        },
        end: {
          dateTime: end,
        },
      },
    });

    console.log('[gcal-create-event] Created event:', response.data.id, 'for user:', user.id);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        event: {
          id: response.data.id,
          htmlLink: response.data.htmlLink,
          summary: response.data.summary,
          start: response.data.start,
          end: response.data.end,
        },
      }),
    };
  } catch (err: any) {
    console.error('[gcal-create-event] Error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal error', details: err.message }),
    };
  }
};

export { handler };
