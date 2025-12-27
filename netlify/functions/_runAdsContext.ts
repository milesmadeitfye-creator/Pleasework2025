/**
 * Run Ads Context - DEPRECATED - Use _canonicalRunAdsContext instead
 *
 * This file delegates to the canonical implementation for backward compatibility.
 */

import {
  getRunAdsContext as getCanonicalRunAdsContext,
  formatRunAdsContextForAI as formatCanonical,
  type RunAdsContext as CanonicalRunAdsContext
} from './_canonicalRunAdsContext';

// Re-export types for backward compatibility
export interface RunAdsContext {
  hasMeta: boolean;
  meta: {
    ad_account_id: string | null;
    ad_account_name: string | null;
    page_id: string | null;
    page_name: string | null;
    pixel_id: string | null;
    pixel_name: string | null;
    instagram_id: string | null;
    instagram_username: string | null;
  };
  smartLinksCount: number;
  smartLinks: Array<{
    id: string;
    slug: string;
    title: string;
    destination_url: string;
    created_at: string;
  }>;
  ready: boolean;
  blocker?: string;
}

/**
 * Get run ads context - delegates to canonical implementation
 */
export async function getRunAdsContext(userId: string): Promise<RunAdsContext> {
  // Delegate to canonical implementation (uses service role, canonical base tables)
  const canonical = await getCanonicalRunAdsContext(userId);

  // Transform to legacy format for backward compatibility
  return {
    hasMeta: canonical.hasMeta,
    meta: {
      ad_account_id: canonical.meta.ad_account_id,
      ad_account_name: canonical.meta.ad_account_name,
      page_id: canonical.meta.page_id,
      page_name: canonical.meta.page_name,
      pixel_id: canonical.meta.pixel_id,
      pixel_name: canonical.meta.pixel_name,
      instagram_id: null,
      instagram_username: null,
    },
    smartLinksCount: canonical.links.smartLinksCount,
    smartLinks: canonical.links.latestSmartLink ? [canonical.links.latestSmartLink] : [],
    ready: canonical.ready,
    blocker: canonical.blocker,
  };
}

/**
 * Format run ads context for AI prompt - delegates to canonical
 */
export function formatRunAdsContextForAI(context: RunAdsContext): string {
  // Convert to canonical format and delegate
  const canonical: CanonicalRunAdsContext = {
    hasMeta: context.hasMeta,
    meta: {
      hasMeta: context.hasMeta,
      source: context.hasMeta ? 'user_meta_assets' : 'none',
      ad_account_id: context.meta.ad_account_id,
      ad_account_name: context.meta.ad_account_name,
      page_id: context.meta.page_id,
      page_name: context.meta.page_name,
      pixel_id: context.meta.pixel_id,
      pixel_name: context.meta.pixel_name,
    },
    links: {
      smartLinksCount: context.smartLinksCount,
      oneClickCount: 0,
      publicTrackCount: 0,
      preSaveCount: 0,
      emailCaptureCount: 0,
      totalLinks: context.smartLinksCount,
      latestSmartLink: context.smartLinks[0],
    },
    hasAnyDestination: context.smartLinksCount > 0,
    destinationCandidates: {
      latestSmartLinkUrl: context.smartLinks[0]?.destination_url,
    },
    ready: context.ready,
    blocker: context.blocker as any,
  };

  return formatCanonical(canonical);
}
