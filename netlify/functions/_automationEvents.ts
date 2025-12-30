/**
 * Automation Events Logger
 *
 * Utility for logging product events to public.automation_events
 * with idempotent inserts (prevents duplicate events per user).
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface AutomationEvent {
  user_id: string;
  event_key: string;
  payload?: Record<string, any>;
}

/**
 * Log an automation event (idempotent per user_id + event_key)
 *
 * Returns true if event was inserted, false if it already existed
 */
export async function logAutomationEvent(event: AutomationEvent): Promise<boolean> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if event already exists for this user
    const { data: existing } = await supabase
      .from('automation_events')
      .select('id')
      .eq('user_id', event.user_id)
      .eq('event_key', event.event_key)
      .maybeSingle();

    if (existing) {
      console.log(`[AutomationEvents] Event already exists: ${event.event_key} for user ${event.user_id}`);
      return false;
    }

    // Insert new event
    const { error } = await supabase
      .from('automation_events')
      .insert({
        user_id: event.user_id,
        event_key: event.event_key,
        payload: event.payload || {},
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[AutomationEvents] Insert error:', error);
      return false;
    }

    console.log(`[AutomationEvents] Logged: ${event.event_key} for user ${event.user_id}`);
    return true;
  } catch (error) {
    console.error('[AutomationEvents] Unexpected error:', error);
    return false;
  }
}

/**
 * Log multiple events at once
 */
export async function logAutomationEvents(events: AutomationEvent[]): Promise<number> {
  let logged = 0;
  for (const event of events) {
    const success = await logAutomationEvent(event);
    if (success) logged++;
  }
  return logged;
}

/**
 * Convenience methods for common events
 */
export const AutomationEventLogger = {
  smartlinkCreated: async (userId: string, smartlinkId: string) => {
    return logAutomationEvent({
      user_id: userId,
      event_key: 'smartlink_created',
      payload: { smartlink_id: smartlinkId },
    });
  },

  calendarConnected: async (userId: string, provider: string) => {
    return logAutomationEvent({
      user_id: userId,
      event_key: 'calendar_connected',
      payload: { provider },
    });
  },

  ghosteAiUsed: async (userId: string) => {
    return logAutomationEvent({
      user_id: userId,
      event_key: 'ghoste_ai_used',
      payload: {},
    });
  },

  upgraded: async (userId: string, planName: string) => {
    return logAutomationEvent({
      user_id: userId,
      event_key: 'upgraded',
      payload: { plan: planName },
    });
  },

  welcomeSent: async (userId: string, emailJobId: string) => {
    return logAutomationEvent({
      user_id: userId,
      event_key: 'welcome_sent',
      payload: { email_job_id: emailJobId },
    });
  },
};
