import type { Handler } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

/**
 * GET /.netlify/functions/run-ads-context
 *
 * Returns canonical "run ads" readiness data using SAME source as UI card.
 *
 * CRITICAL: This is the ONLY source of truth for AI run-ads decisions.
 * Uses ai_get_setup_status RPC (same as UI "Meta connected" card).
 *
 * Returns:
 * {
 *   ok: true,
 *   hasMeta: boolean,
 *   meta: { ad_account_id, page_id, pixel_id } | null,
 *   smartLinksCount: number,
 *   smartLinks: [...],
 *   uploadsCount: number,
 *   uploads: [...]
 * }
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    console.log('[run-ads-context] Fetching for user:', user.id);

    // 1. Call ai_get_setup_status RPC (SAME AS UI)
    const { data: setupData, error: rpcError } = await supabase
      .rpc('ai_get_setup_status', { p_user_id: user.id });

    if (rpcError) {
      console.error('[run-ads-context] RPC error:', rpcError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Failed to fetch setup status',
          details: rpcError.message,
        }),
      };
    }

    const hasMeta = setupData?.meta?.has_meta ?? false;
    const adAccounts = setupData?.meta?.ad_accounts || [];
    const pages = setupData?.meta?.pages || [];
    const pixels = setupData?.meta?.pixels || [];
    const smartLinksCount = setupData?.smart_links_count || 0;
    const smartLinksPreview = setupData?.smart_links_preview || [];

    // 2. Get uploaded media (videos/images)
    const { data: uploads } = await supabase
      .from('media_assets')
      .select('id, type, url, meta_ready_url, title, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const uploadsCount = uploads?.length || 0;

    // 3. Build response (matches UI data structure)
    const meta = hasMeta && adAccounts.length > 0 && pages.length > 0 ? {
      ad_account_id: adAccounts[0].account_id || adAccounts[0].id,
      ad_account_name: adAccounts[0].name,
      page_id: pages[0].id,
      page_name: pages[0].name,
      pixel_id: pixels.length > 0 ? pixels[0].id : null,
      pixel_name: pixels.length > 0 ? pixels[0].name : null,
    } : null;

    const response = {
      ok: true,
      hasMeta,
      meta,
      smartLinksCount,
      smartLinks: smartLinksPreview.map((link: any) => ({
        id: link.id,
        title: link.title,
        slug: link.slug,
        destination_url: link.destination_url,
      })),
      uploadsCount,
      uploads: uploads?.map(u => ({
        id: u.id,
        type: u.type,
        url: u.url,
        meta_ready_url: u.meta_ready_url,
        title: u.title,
      })) || [],
    };

    console.log('[run-ads-context] Result:', {
      hasMeta: response.hasMeta,
      meta: response.meta ? 'present' : 'null',
      smartLinksCount: response.smartLinksCount,
      uploadsCount: response.uploadsCount,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('[run-ads-context] Unexpected error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: 'Internal server error',
        details: error.message,
      }),
    };
  }
};
