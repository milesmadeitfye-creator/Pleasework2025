/**
 * Media Meta-Ready URL Generator
 *
 * Purpose: Generate and validate Meta-fetchable URLs for uploaded media
 *
 * Flow:
 * 1. Fetch media_assets row
 * 2. Generate signed URL (24hr TTL) or use public URL
 * 3. Validate reachability with HEAD request
 * 4. Update meta_ready flags in DB
 * 5. Return verified URL for Meta Ads API
 *
 * Critical: This ensures Meta can ALWAYS fetch the asset URL
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[media-meta-ready] Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

interface RequestBody {
  media_asset_id: string;
  force_refresh?: boolean;
}

interface SuccessResponse {
  ok: true;
  media_asset_id: string;
  meta_ready_url: string;
  kind: string;
  filename: string;
  expires_at?: string;
}

interface ErrorResponse {
  ok: false;
  error: string;
  media_asset_id?: string;
  details?: string;
}

/**
 * Validate URL is reachable with HEAD request
 */
async function validateUrlReachability(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    console.log('[media-meta-ready] HEAD request status:', response.status);
    return response.ok;
  } catch (err: any) {
    console.error('[media-meta-ready] HEAD request failed:', err.message);
    return false;
  }
}

/**
 * Generate signed URL with retry
 */
async function generateSignedUrl(
  bucket: string,
  path: string,
  retries = 1
): Promise<{ url: string; expiresAt: string } | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 24-hour TTL
      const expiresIn = 24 * 60 * 60; // 86400 seconds

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

      if (error) {
        console.error(`[media-meta-ready] Signed URL error (attempt ${attempt + 1}):`, error);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay
          continue;
        }
        return null;
      }

      if (!data?.signedUrl) {
        console.error('[media-meta-ready] No signed URL returned');
        return null;
      }

      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      return {
        url: data.signedUrl,
        expiresAt,
      };
    } catch (err: any) {
      console.error(`[media-meta-ready] Exception (attempt ${attempt + 1}):`, err);
      if (attempt >= retries) {
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return null;
}

export const handler: Handler = async (event: HandlerEvent) => {
  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' } as ErrorResponse),
    };
  }

  try {
    // Parse request
    const body: RequestBody = JSON.parse(event.body || '{}');
    const { media_asset_id, force_refresh = false } = body;

    if (!media_asset_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'media_asset_id is required',
        } as ErrorResponse),
      };
    }

    console.log('[media-meta-ready] Processing:', media_asset_id, { force_refresh });

    // Fetch media asset
    const { data: asset, error: fetchError } = await supabase
      .from('media_assets')
      .select('*')
      .eq('id', media_asset_id)
      .maybeSingle();

    if (fetchError) {
      console.error('[media-meta-ready] Fetch error:', fetchError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Database error',
          details: fetchError.message,
        } as ErrorResponse),
      };
    }

    if (!asset) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Media asset not found',
          media_asset_id,
        } as ErrorResponse),
      };
    }

    if (asset.status !== 'ready') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: `Media asset not ready (status: ${asset.status})`,
          media_asset_id,
        } as ErrorResponse),
      };
    }

    // Check if already meta-ready and not expired
    if (
      !force_refresh &&
      asset.meta_ready &&
      asset.meta_ready_url &&
      asset.signed_url_expires_at
    ) {
      const expiresAt = new Date(asset.signed_url_expires_at);
      const now = new Date();
      const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);

      // If still valid for >1 hour, reuse
      if (hoursUntilExpiry > 1) {
        console.log('[media-meta-ready] Reusing existing URL (valid for', hoursUntilExpiry.toFixed(1), 'hours)');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            ok: true,
            media_asset_id: asset.id,
            meta_ready_url: asset.meta_ready_url,
            kind: asset.kind,
            filename: asset.filename,
            expires_at: asset.signed_url_expires_at,
          } as SuccessResponse),
        };
      }
    }

    // Generate URL (prefer signed URL for reliability)
    let metaReadyUrl: string | null = null;
    let expiresAt: string | null = null;

    // Try signed URL first
    const signedResult = await generateSignedUrl(
      asset.storage_bucket,
      asset.storage_key,
      1 // 1 retry
    );

    if (signedResult) {
      metaReadyUrl = signedResult.url;
      expiresAt = signedResult.expiresAt;
      console.log('[media-meta-ready] Generated signed URL');
    } else if (asset.public_url) {
      // Fallback to public URL
      metaReadyUrl = asset.public_url;
      console.log('[media-meta-ready] Using public URL');
    } else {
      console.error('[media-meta-ready] No URL available');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Could not generate URL',
          media_asset_id,
        } as ErrorResponse),
      };
    }

    // Validate URL reachability
    console.log('[media-meta-ready] Validating URL reachability...');
    const isReachable = await validateUrlReachability(metaReadyUrl);

    if (!isReachable) {
      console.error('[media-meta-ready] URL not reachable');

      // Update DB: mark as NOT meta-ready
      await supabase
        .from('media_assets')
        .update({
          meta_ready: false,
          meta_last_check_at: new Date().toISOString(),
        })
        .eq('id', media_asset_id);

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'URL not reachable by Meta',
          media_asset_id,
          details: 'HEAD request failed',
        } as ErrorResponse),
      };
    }

    // Success: Update DB
    console.log('[media-meta-ready] URL validated successfully');
    await supabase
      .from('media_assets')
      .update({
        meta_ready: true,
        meta_ready_url: metaReadyUrl,
        signed_url: signedResult ? signedResult.url : null,
        signed_url_expires_at: expiresAt,
        meta_last_check_at: new Date().toISOString(),
      })
      .eq('id', media_asset_id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        media_asset_id: asset.id,
        meta_ready_url: metaReadyUrl,
        kind: asset.kind,
        filename: asset.filename,
        expires_at: expiresAt || undefined,
      } as SuccessResponse),
    };
  } catch (err: any) {
    console.error('[media-meta-ready] Unexpected error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Internal server error',
        details: err.message,
      } as ErrorResponse),
    };
  }
};
