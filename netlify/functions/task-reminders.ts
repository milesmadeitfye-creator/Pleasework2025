import { Handler } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAILGUN_FROM_EMAIL = process.env.MAILGUN_FROM_EMAIL || 'Ghoste <no-reply@ghostemedia.com>';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

interface Task {
  id: string;
  user_id: string;
  title: string;
  due_at: string | null;
  reminder_channel: 'none' | 'email' | 'sms' | 'both';
  reminder_minutes_before: number;
}

interface AICalendarEvent {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  channel: 'email' | 'sms' | 'both';
  reminder_minutes_before: number;
}

interface UserProfile {
  email: string;
  phone_number?: string | null;
}

async function sendEmailReminder(to: string, subject: string, body: string): Promise<void> {
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.warn('[sendEmailReminder] Mailgun not configured, skipping email');
    return;
  }

  try {
    const auth = Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');

    const formData = new URLSearchParams();
    formData.append('from', MAILGUN_FROM_EMAIL);
    formData.append('to', to);
    formData.append('subject', subject);
    formData.append('text', body);

    const response = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[sendEmailReminder] Mailgun error:', errorText);
      throw new Error(`Mailgun failed: ${response.status}`);
    }

    console.log('[sendEmailReminder] Email sent to:', to);
  } catch (error: any) {
    console.error('[sendEmailReminder] Error:', error?.message || error);
    throw error;
  }
}

async function sendSMSReminder(to: string, body: string): Promise<void> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    console.warn('[sendSMSReminder] Twilio not configured, skipping SMS');
    return;
  }

  try {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const formData = new URLSearchParams();
    formData.append('From', TWILIO_FROM_NUMBER);
    formData.append('To', to);
    formData.append('Body', body);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[sendSMSReminder] Twilio error:', errorText);
      throw new Error(`Twilio failed: ${response.status}`);
    }

    console.log('[sendSMSReminder] SMS sent to:', to);
  } catch (error: any) {
    console.error('[sendSMSReminder] Error:', error?.message || error);
    throw error;
  }
}

export const handler: Handler = async () => {
  console.log('[TASK_REMINDERS] Starting scheduled reminder check');

  try {
    const supabase = getSupabaseAdmin();

    const now = new Date();
    const windowEnd = new Date(now.getTime() + 10 * 60000);

    console.log('[TASK_REMINDERS] Check window:', {
      now: now.toISOString(),
      windowEnd: windowEnd.toISOString(),
    });

    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, user_id, title, due_at, reminder_channel, reminder_minutes_before')
      .eq('status', 'pending')
      .neq('reminder_channel', 'none')
      .not('due_at', 'is', null);

    if (tasksError) {
      console.error('[TASK_REMINDERS] Error fetching tasks:', tasksError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch tasks' }),
      };
    }

    console.log('[TASK_REMINDERS] Found', tasks?.length || 0, 'tasks with reminders');

    // Also fetch AI calendar events that are due for reminders
    const { data: calendarEvents, error: calendarError } = await supabase
      .from('ai_calendar_events')
      .select('id, user_id, title, description, start_at, end_at, channel, reminder_minutes_before')
      .eq('status', 'scheduled')
      .gte('start_at', now.toISOString())
      .lte('start_at', windowEnd.toISOString());

    if (calendarError) {
      console.error('[TASK_REMINDERS] Error fetching calendar events:', calendarError);
    } else {
      console.log('[TASK_REMINDERS] Found', calendarEvents?.length || 0, 'calendar events');
    }

    let sentCount = 0;
    let errorCount = 0;

    // Process tasks
    for (const task of tasks || []) {
      try {
        if (!task.due_at) continue;

        const dueAt = new Date(task.due_at);
        const reminderMinutes = task.reminder_minutes_before || 15;
        const reminderAt = new Date(dueAt.getTime() - reminderMinutes * 60000);

        if (reminderAt < now || reminderAt > windowEnd) {
          continue;
        }

        console.log('[TASK_REMINDERS] Sending reminder for task:', task.id, task.title);

        const { data: fetchedProfile, error: profileError } = await supabase
          .from('user_profiles')
          .select('email, phone_number')
          .eq('user_id', task.user_id)
          .maybeSingle();

        let profile = fetchedProfile;

        if (profileError || !profile) {
          const { data: authUser } = await supabase.auth.admin.getUserById(task.user_id);

          if (!authUser?.user?.email) {
            console.warn('[TASK_REMINDERS] No email found for user:', task.user_id);
            continue;
          }

          profile = { email: authUser.user.email, phone_number: null };
        }

        const dueAtFormatted = new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(dueAt);

        const subject = `Ghoste reminder: ${task.title}`;
        const body = `You have a Ghoste task coming up: "${task.title}" at ${dueAtFormatted}.`;

        if (task.reminder_channel === 'email' || task.reminder_channel === 'both') {
          try {
            await sendEmailReminder(profile.email, subject, body);
            sentCount++;
          } catch (emailErr) {
            console.error('[TASK_REMINDERS] Email failed for task:', task.id, emailErr);
            errorCount++;
          }
        }

        if (
          (task.reminder_channel === 'sms' || task.reminder_channel === 'both') &&
          profile.phone_number
        ) {
          try {
            await sendSMSReminder(profile.phone_number, body);
            sentCount++;
          } catch (smsErr) {
            console.error('[TASK_REMINDERS] SMS failed for task:', task.id, smsErr);
            errorCount++;
          }
        }
      } catch (taskErr) {
        console.error('[TASK_REMINDERS] Error processing task:', task.id, taskErr);
        errorCount++;
      }
    }

    // Process AI calendar events
    for (const event of calendarEvents || []) {
      try {
        const startAt = new Date(event.start_at);
        const reminderMinutes = event.reminder_minutes_before || 60;
        const reminderAt = new Date(startAt.getTime() - reminderMinutes * 60000);

        if (reminderAt < now || reminderAt > windowEnd) {
          continue;
        }

        console.log('[TASK_REMINDERS] Sending calendar reminder:', event.id, event.title);

        const { data: fetchedProfile, error: profileError } = await supabase
          .from('user_profiles')
          .select('email, phone_number')
          .eq('user_id', event.user_id)
          .maybeSingle();

        let profile = fetchedProfile;

        if (profileError || !profile) {
          const { data: authUser } = await supabase.auth.admin.getUserById(event.user_id);

          if (!authUser?.user?.email) {
            console.warn('[TASK_REMINDERS] No email found for user:', event.user_id);
            continue;
          }

          profile = { email: authUser.user.email, phone_number: null };
        }

        const startAtFormatted = new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        }).format(startAt);

        const subject = `Ghoste Calendar: ${event.title}`;
        let body = `Reminder: "${event.title}" is coming up at ${startAtFormatted}.`;
        if (event.description) {
          body += `\n\n${event.description}`;
        }

        if (event.channel === 'email' || event.channel === 'both') {
          try {
            await sendEmailReminder(profile.email, subject, body);
            sentCount++;
          } catch (emailErr) {
            console.error('[TASK_REMINDERS] Email failed for event:', event.id, emailErr);
            errorCount++;
          }
        }

        if ((event.channel === 'sms' || event.channel === 'both') && profile.phone_number) {
          try {
            await sendSMSReminder(profile.phone_number, body);
            sentCount++;
          } catch (smsErr) {
            console.error('[TASK_REMINDERS] SMS failed for event:', event.id, smsErr);
            errorCount++;
          }
        }

        // Mark event as sent
        await supabase
          .from('ai_calendar_events')
          .update({ status: 'sent', updated_at: new Date().toISOString() })
          .eq('id', event.id);

      } catch (eventErr) {
        console.error('[TASK_REMINDERS] Error processing calendar event:', event.id, eventErr);
        errorCount++;
      }
    }

    const totalChecked = (tasks?.length || 0) + (calendarEvents?.length || 0);

    console.log('[TASK_REMINDERS] Completed:', {
      tasks: tasks?.length || 0,
      calendarEvents: calendarEvents?.length || 0,
      sent: sentCount,
      errors: errorCount,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        checked: totalChecked,
        tasks: tasks?.length || 0,
        calendarEvents: calendarEvents?.length || 0,
        sent: sentCount,
        errors: errorCount,
      }),
    };
  } catch (error: any) {
    console.error('[TASK_REMINDERS] Fatal error:', error?.message || error);
    console.error('[TASK_REMINDERS] Stack:', error?.stack);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to process reminders' }),
    };
  }
};
