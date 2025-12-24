import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_supabaseAdmin';
import { getMetaCredsForUser, normalizeAct } from './_metaAutopilotClient';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

type CC = {
  id: string;
  name?: string;
  rule?: any;
  event_type?: string;
  custom_event_type?: string;
  pixel_id?: string | { id?: string };
};

/**
 * Fetch all pages from Meta API (handles pagination)
 */
async function fetchAll(accessToken: string, url: string): Promise<any[]> {
  const out: any[] = [];
  let next: string | null = url;

  while (next) {
    const res = await fetch(next);
    const json = await res.json();

    if (!res.ok) {
      const msg = json?.error?.message || 'Meta API error';
      throw new Error(msg);
    }

    out.push(...(json.data || []));
    next = json?.paging?.next || null;
  }

  return out;
}

/**
 * Bulletproof custom conversions endpoint
 * - Fetches from connected ad account
 * - Handles pagination
 * - Filters after fetch (optional by pixel_id)
 * - Debug mode shows account info + counts
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    // AUTH: Resolve user from JWT (same pattern as ads-autopilot-run)
    const auth = event.headers.authorization || event.headers.Authorization;
    if (!auth?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'Missing authorization header' }),
      };
    }

    const jwt = auth.replace('Bearer ', '').trim();
    const sb = supabaseAdmin;

    const { data: u, error: ue } = await sb.auth.getUser(jwt);
    if (ue || !u?.user?.id) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'Invalid auth token' }),
      };
    }
    const userId = u.user.id;

    // Query params
    const pixelId = event.queryStringParameters?.pixel_id || '';
    const debug = event.queryStringParameters?.debug === '1';

    console.log('[meta-list-custom-conversions] User:', userId.slice(0, 8), 'Pixel:', pixelId || 'all', 'Debug:', debug);

    // Get Meta credentials from user_meta_connections
    const creds = await getMetaCredsForUser(userId);
    const act = normalizeAct(creds.adAccountId);

    console.log('[meta-list-custom-conversions] Ad Account:', act);

    // Build URL with all fields
    const base = new URL(`https://graph.facebook.com/v20.0/${act}/customconversions`);
    base.searchParams.set('access_token', creds.accessToken);
    base.searchParams.set('limit', '200');
    base.searchParams.set(
      'fields',
      [
        'id',
        'name',
        'rule',
        'event_type',
        'custom_event_type',
        'pixel_id',
      ].join(',')
    );

    // Fetch all pages
    const all = await fetchAll(creds.accessToken, base.toString());

    console.log('[meta-list-custom-conversions] Fetched:', all.length, 'custom conversions');

    // Normalize pixel_id (can be string or object)
    const normalize = (cc: CC) => {
      const pid = typeof cc.pixel_id === 'string' ? cc.pixel_id : cc.pixel_id?.id;
      return { ...cc, pixel_id: pid || undefined };
    };

    const normalized = all.map(normalize);

    // Filter after fetch (only if pixelId provided)
    const filtered = pixelId
      ? normalized.filter((cc) => cc.pixel_id === pixelId)
      : normalized;

    console.log('[meta-list-custom-conversions] Filtered:', filtered.length, 'returned');

    // Build response
    const response: any = {
      ok: true,
      customConversions: filtered,
    };

    // Add debug info if requested
    if (debug) {
      response.debug = {
        adAccountIdUsed: act,
        pixelIdFilter: pixelId || null,
        totalFetched: normalized.length,
        totalReturned: filtered.length,
        sample: filtered.slice(0, 3),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response),
    };
  } catch (e: any) {
    console.error('[meta-list-custom-conversions] Error:', e);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
    };
  }
};
