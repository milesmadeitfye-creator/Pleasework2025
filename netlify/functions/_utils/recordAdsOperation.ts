/**
 * Server-side recorder for ads operations
 * Writes to ads_operations table with sanitized data
 */

import { createClient } from '@supabase/supabase-js';
import { sanitizeForDebug, extractMetaIds } from './sanitizeDebug';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface RecordOperationParams {
  label: string;
  request?: any;
  response?: any;
  status?: number;
  ok?: boolean;
  error?: string;
  userId?: string;
  authHeader?: string;
  source?: string;
}

/**
 * Resolve user ID from auth header
 */
async function resolveUserId(authHeader?: string): Promise<string | null> {
  if (!authHeader) return null;

  try {
    // Extract Bearer token
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;

    const token = match[1];

    // Use anon key client to resolve user from JWT
    const anonClient = createClient(
      supabaseUrl,
      process.env.SUPABASE_ANON_KEY!
    );

    const { data, error } = await anonClient.auth.getUser(token);
    if (error || !data.user) return null;

    return data.user.id;
  } catch (err) {
    console.warn('[recordAdsOperation] Failed to resolve user ID:', err);
    return null;
  }
}

/**
 * Record an ads operation to the database
 */
export async function recordAdsOperation(params: RecordOperationParams): Promise<void> {
  try {
    // Create service role client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Resolve user ID
    let userId = params.userId;
    if (!userId && params.authHeader) {
      userId = await resolveUserId(params.authHeader) || undefined;
    }

    // Sanitize data
    const sanitizedRequest = params.request ? sanitizeForDebug(params.request) : null;
    const sanitizedResponse = params.response ? sanitizeForDebug(params.response) : null;

    // Extract Meta IDs
    const metaIds = extractMetaIds(params.response);

    // Insert operation
    const { error } = await supabase
      .from('ads_operations')
      .insert({
        user_id: userId || null,
        label: params.label,
        source: params.source || 'netlify',
        request: sanitizedRequest,
        response: sanitizedResponse,
        status: params.status || null,
        ok: params.ok ?? null,
        meta_campaign_id: metaIds.meta_campaign_id || null,
        meta_adset_id: metaIds.meta_adset_id || null,
        meta_ad_id: metaIds.meta_ad_id || null,
        error: params.error || null,
      });

    if (error) {
      console.error('[recordAdsOperation] Failed to insert:', error);
    }
  } catch (err) {
    // Never throw - logging should not break the main flow
    console.error('[recordAdsOperation] Exception:', err);
  }
}
