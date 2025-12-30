/**
 * Google Calendar OAuth Callback
 *
 * Handles the OAuth callback, exchanges code for tokens, and stores in Supabase
 * Does NOT touch regular Google login/auth flow
 */

import { Handler } from '@netlify/functions';
import { getOAuthClient } from './_googleCalendarClient';
import { createClient } from '@supabase/supabase-js';
import { AutomationEventLogger } from './_automationEvents';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_BASE_URL } = process.env;
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// Base URL for redirects
const BASE_URL = APP_BASE_URL || process.env.URL || 'https://ghoste.one';

const handler: Handler = async (event) => {
  try {
    const code = event.queryStringParameters?.code;
    const state = event.queryStringParameters?.state;

    console.log('[gcal-callback] OAuth callback hit', {
      hasCode: !!code,
      hasState: !!state,
      codeLength: code?.length,
    });

    if (!code) {
      console.error('[gcal-callback] Missing code parameter');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Missing authorization code',
      };
    }

    // Parse user_id from state
    let userId: string | null = null;
    if (state) {
      try {
        const parsed = JSON.parse(state);
        userId = parsed.user_id;
        console.log('[gcal-callback] Parsed state successfully', { userId });
      } catch (err) {
        console.error('[gcal-callback] Failed to parse state:', err, 'Raw state:', state);
      }
    }

    if (!userId) {
      console.error('[gcal-callback] Could not resolve user_id from state');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Could not resolve user identity',
      };
    }

    const oauth2Client = getOAuthClient();

    console.log('[gcal-callback] Exchanging code for tokens...');

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    console.log('[gcal-callback] Token exchange successful', {
      userId,
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      scope: tokens.scope,
      expiresIn: tokens.expiry_date,
    });

    const { access_token, refresh_token, scope, token_type, expiry_date } = tokens as any;

    if (!access_token) {
      console.error('[gcal-callback] No access_token in token response');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Token exchange failed - no access token',
      };
    }

    // Store tokens in Supabase
    console.log('[gcal-callback] Storing tokens in google_calendar_tokens table...');
    const { data: tokenData, error: upsertError } = await supabase
      .from('google_calendar_tokens')
      .upsert(
        {
          user_id: userId,
          access_token,
          refresh_token: refresh_token ?? null,
          scope: scope ?? null,
          token_type: token_type ?? null,
          expiry_date: expiry_date ? new Date(expiry_date).toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select();

    if (upsertError) {
      console.error('[gcal-callback] Failed to store tokens:', {
        error: upsertError,
        code: upsertError.code,
        message: upsertError.message,
        details: upsertError.details,
      });
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Failed to store calendar tokens',
      };
    }

    console.log('[gcal-callback] Successfully stored tokens', {
      userId,
      rowsAffected: tokenData?.length,
    });

    // IMPORTANT: Also update connected_accounts table for unified status tracking
    console.log('[gcal-callback] Updating connected_accounts table...');
    const { data: connectedData, error: connectedAccountsError } = await supabase
      .from('connected_accounts')
      .upsert(
        {
          user_id: userId,
          provider: 'google_calendar',
          status: 'connected',
          last_connected_at: new Date().toISOString(),
          data: {
            scope: scope || null,
            token_type: token_type || null,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      )
      .select();

    if (connectedAccountsError) {
      console.error('[gcal-callback] Failed to update connected_accounts:', {
        error: connectedAccountsError,
        code: connectedAccountsError.code,
        message: connectedAccountsError.message,
      });
      // Don't fail the request - tokens are stored, this is just for status tracking
    } else {
      console.log('[gcal-callback] Successfully updated connected_accounts', {
        userId,
        rowsAffected: connectedData?.length,
      });
    }

    // Log automation event (triggers email decider)
    await AutomationEventLogger.calendarConnected(userId, 'google_calendar').catch(err => {
      console.error('[gcal-callback] Failed to log automation event:', err);
    });

    // Redirect to OAuth completion page (for popup auto-close pattern)
    const redirectUrl = `${BASE_URL}/oauth-complete/google-calendar?status=success`;
    console.log('[gcal-callback] Redirecting to:', redirectUrl);

    return {
      statusCode: 302,
      headers: {
        Location: redirectUrl,
      },
      body: '',
    };
  } catch (err: any) {
    console.error('[gcal-callback] Error:', err);

    // Redirect to error page instead of showing plain text
    const errorUrl = `${BASE_URL}/oauth-complete/google-calendar?status=error&reason=${encodeURIComponent(err.message || 'Unknown error')}`;

    return {
      statusCode: 302,
      headers: {
        Location: errorUrl,
      },
      body: '',
    };
  }
};

export { handler };
