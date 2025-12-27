/**
 * Meta Media Helper
 *
 * Utility functions for ensuring media assets are Meta-ready
 * Used by ads builder and campaign creation functions
 */

interface MetaReadyResult {
  ok: boolean;
  media_asset_id: string;
  meta_ready_url?: string;
  kind?: string;
  filename?: string;
  error?: string;
  details?: string;
}

/**
 * Ensure media asset is Meta-ready and get fetchable URL
 *
 * This is the CRITICAL function that prevents flaky ad creation.
 * Always call this before creating Meta ad creatives.
 *
 * @param media_asset_id - UUID of media_assets row
 * @param netlifyFunctionsUrl - Base URL for Netlify functions
 * @param authToken - User's auth token (optional, for logging)
 * @returns Promise<MetaReadyResult>
 */
export async function ensureMediaMetaReady(
  media_asset_id: string,
  netlifyFunctionsUrl: string = '/.netlify/functions',
  authToken?: string
): Promise<MetaReadyResult> {
  console.log('[metaMediaHelper] Ensuring Meta-ready:', media_asset_id);

  const maxRetries = 2;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(`${netlifyFunctionsUrl}/media-meta-ready`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          media_asset_id,
          force_refresh: attempt > 0, // Force refresh on retry
        }),
      });

      const result = await response.json();

      if (response.ok && result.ok) {
        console.log('[metaMediaHelper] Meta-ready URL obtained:', {
          media_asset_id,
          kind: result.kind,
          filename: result.filename,
        });

        return {
          ok: true,
          media_asset_id,
          meta_ready_url: result.meta_ready_url,
          kind: result.kind,
          filename: result.filename,
        };
      }

      lastError = result.error || 'Unknown error';
      console.warn(`[metaMediaHelper] Attempt ${attempt + 1}/${maxRetries} failed:`, lastError);

      if (attempt < maxRetries - 1) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (err: any) {
      lastError = err.message;
      console.error(`[metaMediaHelper] Exception (attempt ${attempt + 1}):`, err);

      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  console.error('[metaMediaHelper] All attempts failed:', lastError);

  return {
    ok: false,
    media_asset_id,
    error: 'Media not Meta-ready after retries',
    details: lastError || undefined,
  };
}

/**
 * Pick best media asset for ads from attachments
 *
 * Priority: video > image > audio
 *
 * @param attachments - Array of message attachments
 * @returns media_asset_id or null
 */
export function pickBestMediaAssetForAds(
  attachments: Array<{ media_asset_id: string; kind: string }>
): string | null {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  // Priority: video first
  const video = attachments.find(a => a.kind === 'video');
  if (video) return video.media_asset_id;

  // Then image
  const image = attachments.find(a => a.kind === 'image');
  if (image) return image.media_asset_id;

  // Then audio
  const audio = attachments.find(a => a.kind === 'audio');
  if (audio) return audio.media_asset_id;

  // Fallback: first attachment
  return attachments[0]?.media_asset_id || null;
}

/**
 * Log structured data for debugging ads creation
 *
 * DO NOT show these logs to user - internal only
 */
export function logMetaMediaDebug(
  step: string,
  data: Record<string, any>
): void {
  console.log(`[META_MEDIA_DEBUG] ${step}:`, JSON.stringify(data, null, 2));
}
