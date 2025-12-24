import type { Handler } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

const supabase = getSupabaseAdmin();

const GHOSTE_CAL_SUMMARY = 'Ghoste Schedule';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse(401, { error: 'Missing authorization' });
    }

    const jwt = authHeader.replace('Bearer ', '');

    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      console.error('[tasks-create] Auth error:', userError);
      return jsonResponse(401, { error: 'Invalid user' });
    }

    if (!event.body) {
      return jsonResponse(400, { error: 'Missing body' });
    }

    let payload: any;
    try {
      payload = JSON.parse(event.body);
    } catch (e) {
      console.error('[tasks-create] Invalid JSON:', e, event.body);
      return jsonResponse(400, { error: 'Invalid JSON' });
    }

    // Support multiple field name variations from frontend
    const rawTitle = payload.title ?? payload.taskTitle ?? payload.name;
    const rawDue = payload.dueAt ?? payload.due_at ?? payload.dueDateTime ?? payload.dueDate;
    const rawReminder = (payload.reminder ?? payload.reminderChannel ?? payload.reminder_channel ?? 'none').toString();
    const rawSyncToCalendar = payload.syncToCalendar ?? payload.sync_to_calendar ?? false;

    if (!rawTitle || !rawTitle.trim()) {
      console.error('[tasks-create] Missing title:', payload);
      return jsonResponse(400, { error: 'Missing task title' });
    }

    // Parse due date - handle various formats from frontend (optional)
    let dueAtISO: string | null = null;
    if (rawDue && rawDue.trim()) {
      try {
        const parsedDate = new Date(rawDue);
        if (isNaN(parsedDate.getTime())) {
          console.error('[tasks-create] Invalid date format:', rawDue);
          return jsonResponse(400, { error: 'Invalid date format' });
        }
        dueAtISO = parsedDate.toISOString();
      } catch (e) {
        console.error('[tasks-create] Date parsing error:', e, rawDue);
        return jsonResponse(400, { error: 'Invalid date format' });
      }
    }

    const reminderValue = rawReminder.toLowerCase();
    const reminderChannel: 'none' | 'email' | 'sms' | 'both' =
      ['none', 'email', 'sms', 'both'].includes(reminderValue)
        ? (reminderValue as 'none' | 'email' | 'sms' | 'both')
        : 'none';

    console.log('[tasks-create] Creating task:', {
      title: rawTitle,
      due_at: dueAtISO,
      reminder_channel: reminderChannel,
      sync_to_calendar: rawSyncToCalendar
    });

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title: rawTitle.trim(),
        due_at: dueAtISO,
        reminder_channel: reminderChannel,
        sync_to_calendar: !!rawSyncToCalendar,
      })
      .select('*')
      .single();

    if (taskError || !task) {
      console.error('[tasks-create] Task insert error:', taskError);
      return jsonResponse(500, { error: 'Failed to create task', details: taskError?.message });
    }

    // Optional: Best-effort Google Calendar sync (never blocks task creation)
    if (rawSyncToCalendar && dueAtISO) {
      try {
        console.log('[tasks-create] Attempting Google Calendar sync...');
        const { data: sessionData } = await supabase.auth.getUser(jwt);
        const accessToken = sessionData.user?.user_metadata?.provider_token;

        if (accessToken) {
          const calendarId = await ensureGhosteCalendar(user.id, accessToken, supabase);

          if (calendarId) {
            const calendarEventId = await createCalendarEvent(calendarId, accessToken, {
              summary: rawTitle,
              dueAt: dueAtISO,
            });

            if (calendarEventId) {
              await supabase
                .from('tasks')
                .update({ calendar_event_id: calendarEventId })
                .eq('id', task.id);

              console.log('[tasks-create] Calendar sync successful:', calendarEventId);
            }
          }
        } else {
          console.log('[tasks-create] No Google Calendar access token, skipping sync');
        }
      } catch (calErr) {
        console.error('[tasks-create] Calendar sync error (non-fatal):', calErr);
        // Don't fail the task creation, just log the error
      }
    }

    console.log('[tasks-create] Task created successfully:', task.id);

    return jsonResponse(200, {
      success: true,
      task,
    });
  } catch (err: any) {
    console.error('[tasks-create] Server error:', err);
    return jsonResponse(500, { error: 'Server error', message: err?.message });
  }
};

async function ensureGhosteCalendar(userId: string, accessToken: string, supabase: any): Promise<string | null> {
  try {
    const { data: settings } = await supabase
      .from('user_calendar_settings')
      .select('google_calendar_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (settings?.google_calendar_id) {
      return settings.google_calendar_id;
    }

    const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listRes.ok) {
      console.error('[ensureGhosteCalendar] Failed to list calendars:', await listRes.text());
      return null;
    }

    const listData: any = await listRes.json();
    const existingCal = listData.items?.find((cal: any) => cal.summary === GHOSTE_CAL_SUMMARY);

    if (existingCal) {
      await supabase
        .from('user_calendar_settings')
        .upsert({
          user_id: userId,
          google_calendar_id: existingCal.id,
          google_calendar_summary: GHOSTE_CAL_SUMMARY,
        });
      return existingCal.id;
    }

    const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ summary: GHOSTE_CAL_SUMMARY }),
    });

    if (!createRes.ok) {
      console.error('[ensureGhosteCalendar] Failed to create calendar:', await createRes.text());
      return null;
    }

    const newCal: any = await createRes.json();

    await supabase
      .from('user_calendar_settings')
      .upsert({
        user_id: userId,
        google_calendar_id: newCal.id,
        google_calendar_summary: GHOSTE_CAL_SUMMARY,
      });

    return newCal.id;
  } catch (err) {
    console.error('[ensureGhosteCalendar] Error:', err);
    return null;
  }
}

async function createCalendarEvent(
  calendarId: string,
  accessToken: string,
  opts: { summary: string; dueAt: string }
): Promise<string | null> {
  try {
    const start = new Date(opts.dueAt);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: opts.summary,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
        }),
      }
    );

    if (!res.ok) {
      console.error('[createCalendarEvent] Error:', await res.text());
      return null;
    }

    const json: any = await res.json();
    return json.id as string;
  } catch (err) {
    console.error('[createCalendarEvent] Error:', err);
    return null;
  }
}
