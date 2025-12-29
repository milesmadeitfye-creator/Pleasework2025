/**
 * Admin Email Stats
 *
 * Returns email outbox statistics and recent rows for admin dashboard.
 * Protected by X-Admin-Key header.
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

interface StatsResponse {
  ok: boolean;
  stats: {
    queued: number;
    sending: number;
    sent: number;
    failed: number;
    sent_last_24h: number;
  };
  recent: Array<{
    id: number;
    user_id: string | null;
    to_email: string;
    template_key: string;
    status: string;
    error: string | null;
    created_at: string;
    sent_at: string | null;
    attempts: number;
  }>;
  events?: Array<{
    id: number;
    user_id: string;
    event_key: string;
    payload: any;
    created_at: string;
  }>;
  lastRefreshed: string;
}

const handler: Handler = async (event) => {
  console.log('[AdminEmailStats] Request received');

  // Verify admin key
  const adminKey = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
  if (adminKey !== process.env.ADMIN_TASK_KEY) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized - invalid admin key' }),
    };
  }

  try {
    // Initialize Supabase admin client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Supabase configuration missing' }),
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get counts by status
    const { data: statusCounts, error: statusError } = await supabase
      .from('email_outbox')
      .select('status');

    if (statusError) {
      console.error('[AdminEmailStats] Error fetching status counts:', statusError);
      throw new Error('Failed to fetch status counts');
    }

    const stats = {
      queued: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      sent_last_24h: 0,
    };

    statusCounts?.forEach((row: any) => {
      if (row.status === 'queued') stats.queued++;
      else if (row.status === 'sending') stats.sending++;
      else if (row.status === 'sent') stats.sent++;
      else if (row.status === 'failed') stats.failed++;
    });

    // Get sent count in last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentSent, error: recentError } = await supabase
      .from('email_outbox')
      .select('id')
      .eq('status', 'sent')
      .gte('sent_at', twentyFourHoursAgo);

    if (!recentError && recentSent) {
      stats.sent_last_24h = recentSent.length;
    }

    // Get recent outbox rows (limit from query param, default 50, max 200)
    const limit = Math.min(
      parseInt(event.queryStringParameters?.limit || '50', 10),
      200
    );

    const { data: recent, error: recentOutboxError } = await supabase
      .from('email_outbox')
      .select('id, user_id, to_email, template_key, status, error, created_at, sent_at, attempts')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (recentOutboxError) {
      console.error('[AdminEmailStats] Error fetching recent outbox:', recentOutboxError);
      throw new Error('Failed to fetch recent outbox');
    }

    // Optionally get recent automation events
    let events: any[] = [];
    if (event.queryStringParameters?.includeEvents === 'true') {
      const { data: eventsData, error: eventsError } = await supabase
        .from('automation_events')
        .select('id, user_id, event_key, payload, created_at')
        .eq('event_key', 'welcome_sent')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!eventsError && eventsData) {
        events = eventsData;
      }
    }

    const response: StatsResponse = {
      ok: true,
      stats,
      recent: recent || [],
      events: events.length > 0 ? events : undefined,
      lastRefreshed: new Date().toISOString(),
    };

    console.log('[AdminEmailStats] Success:', {
      stats,
      recentCount: recent?.length || 0,
      eventsCount: events.length,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };

  } catch (error: any) {
    console.error('[AdminEmailStats] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Fatal error',
      }),
    };
  }
};

export { handler };
