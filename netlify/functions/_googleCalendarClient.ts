/**
 * Google Calendar OAuth Client Helper
 *
 * Uses unified Google OAuth environment variables
 */

import { google } from 'googleapis';

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URL,
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_OAUTH_REDIRECT_URL) {
  console.warn('[GoogleCalendar] Missing required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_OAUTH_REDIRECT_URL');
}

/**
 * Get OAuth2 client for Google Calendar
 */
export function getOAuthClient() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URL
  );
}

/**
 * Get Google Calendar API client with authenticated credentials
 */
export function getCalendarClient(auth: any) {
  return google.calendar({ version: 'v3', auth });
}
