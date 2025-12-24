import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Aggregates smartlink_events into smartlink_daily_rollups
 * (Same logic as scheduled version)
 */
async function aggregateDaily() {
  console.log('[smartlink-aggregate-run] Starting manual aggregation...');

  // Calculate date range: yesterday and last 7 days for safety backfill
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const endDate = new Date(today);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 7);

  console.log('[smartlink-aggregate-run] Date range:', startDate.toISOString(), 'to', endDate.toISOString());

  // Fetch raw events from the date range
  const { data: events, error: eventsError } = await supabase
    .from('smartlink_events')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString());

  if (eventsError) {
    console.error('[smartlink-aggregate-run] Error fetching events:', eventsError);
    throw eventsError;
  }

  if (!events || events.length === 0) {
    console.log('[smartlink-aggregate-run] No events to process');
    return { processed: 0, upserted: 0 };
  }

  console.log('[smartlink-aggregate-run] Processing', events.length, 'events');

  // Group events by smartlink_id, day, and platform
  const aggregates = new Map<string, {
    smartlink_id: string;
    owner_user_id: string;
    day: string;
    platform: string;
    views: number;
    clicks: number;
    unique_views: number;
    unique_clicks: number;
  }>();

  for (const event of events) {
    const day = new Date(event.created_at).toISOString().slice(0, 10);
    const platform = event.platform || 'all';

    const key = `${event.smartlink_id}:${day}:${platform}`;

    if (!aggregates.has(key)) {
      aggregates.set(key, {
        smartlink_id: event.smartlink_id,
        owner_user_id: event.owner_user_id,
        day,
        platform,
        views: 0,
        clicks: 0,
        unique_views: 0,
        unique_clicks: 0,
      });
    }

    const agg = aggregates.get(key)!;

    if (event.event_type === 'page_view') {
      agg.views += 1;
      if (event.is_unique) {
        agg.unique_views += 1;
      }
    } else if (event.event_type === 'outbound_click') {
      agg.clicks += 1;
      if (event.is_unique) {
        agg.unique_clicks += 1;
      }
    }
  }

  console.log('[smartlink-aggregate-run] Generated', aggregates.size, 'aggregate rows');

  // Also create 'all' platform aggregates
  const allPlatformAggs = new Map<string, {
    smartlink_id: string;
    owner_user_id: string;
    day: string;
    platform: string;
    views: number;
    clicks: number;
    unique_views: number;
    unique_clicks: number;
  }>();

  for (const [key, agg] of aggregates) {
    if (agg.platform !== 'all') {
      const allKey = `${agg.smartlink_id}:${agg.day}:all`;

      if (!allPlatformAggs.has(allKey)) {
        allPlatformAggs.set(allKey, {
          smartlink_id: agg.smartlink_id,
          owner_user_id: agg.owner_user_id,
          day: agg.day,
          platform: 'all',
          views: 0,
          clicks: 0,
          unique_views: 0,
          unique_clicks: 0,
        });
      }

      const allAgg = allPlatformAggs.get(allKey)!;
      allAgg.views += agg.views;
      allAgg.clicks += agg.clicks;
      allAgg.unique_views += agg.unique_views;
      allAgg.unique_clicks += agg.unique_clicks;
    }
  }

  // Merge 'all' aggregates with per-platform aggregates
  for (const [key, agg] of allPlatformAggs) {
    aggregates.set(key, agg);
  }

  console.log('[smartlink-aggregate-run] Total rows with all platforms:', aggregates.size);

  // Upsert into smartlink_daily_rollups
  const rows = Array.from(aggregates.values());

  if (rows.length === 0) {
    console.log('[smartlink-aggregate-run] No rows to upsert');
    return { processed: events.length, upserted: 0 };
  }

  // Batch upsert
  const batchSize = 500;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const { error: upsertError } = await supabase
      .from('smartlink_daily_rollups')
      .upsert(batch, {
        onConflict: 'smartlink_id,day,platform',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error('[smartlink-aggregate-run] Error upserting batch:', upsertError);
      throw upsertError;
    }

    upserted += batch.length;
    console.log('[smartlink-aggregate-run] Upserted', upserted, '/', rows.length, 'rows');
  }

  console.log('[smartlink-aggregate-run] ✅ Aggregation complete:', upserted, 'rows processed');

  return { processed: events.length, upserted };
}

/**
 * Manual trigger endpoint for on-demand aggregation
 * Can be called by admin users or for testing
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
    };
  }

  try {
    // Optional: Add auth check here if you want to restrict access
    // For now, allow any authenticated user to trigger
    const auth = event.headers.authorization || event.headers.Authorization;
    if (!auth?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'Missing authorization' }),
      };
    }

    const jwt = auth.replace('Bearer ', '').trim();
    const { data: u, error: ue } = await supabase.auth.getUser(jwt);
    if (ue || !u?.user?.id) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'Invalid auth token' }),
      };
    }

    console.log('[smartlink-aggregate-run] Manual trigger by user:', u.user.id.slice(0, 8));

    const result = await aggregateDaily();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        message: 'Aggregation completed',
        ...result,
      }),
    };
  } catch (err: any) {
    console.error('[smartlink-aggregate-run] Failed:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: err?.message || 'Aggregation failed' }),
    };
  }
};
