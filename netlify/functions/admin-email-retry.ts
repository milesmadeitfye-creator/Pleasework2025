/**
 * Admin Email Retry
 *
 * Retries failed emails by resetting them to 'queued' status.
 * Supports:
 * - Retry specific IDs: POST { ids: [1, 2, 3] }
 * - Retry all failed: POST { status: "failed", limit: 50 }
 *
 * Protected by X-Admin-Key header.
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

interface RetryRequest {
  ids?: number[];
  status?: string;
  limit?: number;
}

const handler: Handler = async (event) => {
  console.log('[AdminEmailRetry] Request received');

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

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

    // Parse request body
    let requestData: RetryRequest = {};
    if (event.body) {
      try {
        requestData = JSON.parse(event.body);
      } catch {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid JSON body' }),
        };
      }
    }

    const { ids, status, limit } = requestData;

    let idsToRetry: number[] = [];

    if (ids && Array.isArray(ids) && ids.length > 0) {
      // Retry specific IDs
      idsToRetry = ids;
      console.log('[AdminEmailRetry] Retrying specific IDs:', idsToRetry);

    } else if (status === 'failed') {
      // Retry all failed emails (with limit)
      const retryLimit = Math.min(limit || 50, 100);

      const { data: failedRows, error: fetchError } = await supabase
        .from('email_outbox')
        .select('id')
        .eq('status', 'failed')
        .order('created_at', { ascending: true })
        .limit(retryLimit);

      if (fetchError) {
        console.error('[AdminEmailRetry] Error fetching failed rows:', fetchError);
        throw new Error('Failed to fetch failed emails');
      }

      if (!failedRows || failedRows.length === 0) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ok: true,
            retriedCount: 0,
            message: 'No failed emails to retry',
          }),
        };
      }

      idsToRetry = failedRows.map((row: any) => row.id);
      console.log('[AdminEmailRetry] Retrying all failed (limit:', retryLimit, '):', idsToRetry.length);

    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Must provide either "ids" array or status="failed"',
        }),
      };
    }

    // Reset status to 'queued' and clear error
    const { data: updated, error: updateError } = await supabase
      .from('email_outbox')
      .update({
        status: 'queued',
        error: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', idsToRetry)
      .select('id');

    if (updateError) {
      console.error('[AdminEmailRetry] Error updating rows:', updateError);
      throw new Error('Failed to update email status');
    }

    const retriedCount = updated?.length || 0;

    console.log('[AdminEmailRetry] Success:', {
      requested: idsToRetry.length,
      retried: retriedCount,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        retriedCount,
        requestedIds: idsToRetry.length,
      }),
    };

  } catch (error: any) {
    console.error('[AdminEmailRetry] Fatal error:', error);
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
