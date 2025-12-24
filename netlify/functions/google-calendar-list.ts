import { Handler, HandlerEvent } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing or invalid authorization header' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseAdmin();

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[GOOGLE_CALENDAR_LIST] Auth error:', authError?.message);
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { accessToken } = body;

    if (!accessToken) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing accessToken' }),
      };
    }

    console.log('[GOOGLE_CALENDAR_LIST] Fetching calendars for user:', user.id);

    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GOOGLE_CALENDAR_LIST] Google API error:', errorText);

      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      return {
        statusCode: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Failed to fetch calendars',
          details: errorData.error?.message || errorData.message || 'Unknown error',
        }),
      };
    }

    const data = await response.json();
    const calendars = data.items || [];

    console.log('[GOOGLE_CALENDAR_LIST] Found', calendars.length, 'calendars');

    // Mark Google Calendar as connected in connected_accounts
    try {
      const now = new Date().toISOString();
      const primaryCalendar = calendars.find((cal: any) => cal.primary);

      await supabase.from('connected_accounts').upsert(
        {
          user_id: user.id,
          provider: 'google_calendar',
          status: 'connected',
          last_connected_at: now,
          data: {
            primary_calendar_id: primaryCalendar?.id || null,
            calendar_count: calendars.length,
          },
        },
        { onConflict: 'user_id,provider' }
      );

      console.log('[GOOGLE_CALENDAR_LIST] Marked Google Calendar as connected');
    } catch (connErr) {
      console.error('[GOOGLE_CALENDAR_LIST] Failed to update connected_accounts:', connErr);
      // Don't fail the request if this secondary operation fails
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendars }),
    };
  } catch (error: any) {
    console.error('[GOOGLE_CALENDAR_LIST] Error:', error?.message || error);
    console.error('[GOOGLE_CALENDAR_LIST] Stack:', error?.stack);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch calendars' }),
    };
  }
};
