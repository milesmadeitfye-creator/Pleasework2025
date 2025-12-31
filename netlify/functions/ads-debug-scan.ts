/**
 * Ads Debug Scan Endpoint
 * Returns recent ads operations and campaigns for debugging
 */

import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  const authHeader = event.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "unauthorized" }),
    };
  }

  const supabase = getSupabaseAdmin();

  // Resolve user from token
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "invalid_token" }),
    };
  }

  try {
    const result: any = {
      ok: true,
      now: new Date().toISOString(),
      operations: [],
      campaigns: [],
      drafts: [],
      summary: {
        total_campaigns: 0,
        draft_count: 0,
        published_count: 0,
        failed_count: 0,
        last_publish_attempt: null,
      },
    };

    // Fetch recent operations for this user
    const { data: operations, error: opsError } = await supabase
      .from('ads_operations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (opsError) {
      console.error('[ads-debug-scan] Failed to fetch operations:', opsError);
    } else {
      result.operations = operations || [];

      // Find last publish attempt
      const publishOps = (operations || []).filter((op: any) =>
        op.label?.includes('publish') || op.label === 'saveDraft'
      );
      if (publishOps.length > 0) {
        result.summary.last_publish_attempt = {
          label: publishOps[0].label,
          created_at: publishOps[0].created_at,
          ok: publishOps[0].ok,
          error: publishOps[0].error,
        };
      }
    }

    // Try to fetch campaigns from various possible tables (gracefully handle missing tables)

    // Try ad_campaigns
    try {
      const { data: adCampaigns, error: campaignsError } = await supabase
        .from('ad_campaigns')
        .select('id, created_at, updated_at, status, name, meta_campaign_id, meta_adset_id, meta_ad_id, last_error, ad_goal, daily_budget_cents, campaign_type')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(25);

      if (!campaignsError && adCampaigns) {
        result.campaigns = adCampaigns;

        // Update summary
        result.summary.total_campaigns = adCampaigns.length;
        result.summary.draft_count = adCampaigns.filter((c: any) => c.status === 'draft').length;
        result.summary.published_count = adCampaigns.filter((c: any) => c.status === 'published').length;
        result.summary.failed_count = adCampaigns.filter((c: any) => c.status === 'failed').length;
      }
    } catch (e) {
      // Table doesn't exist, skip
    }

    // Try campaign_drafts
    try {
      const { data: campaignDrafts, error: draftsError } = await supabase
        .from('campaign_drafts')
        .select('id, created_at, updated_at, status, name, goal, budget_daily, duration_days')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(25);

      if (!draftsError && campaignDrafts) {
        result.drafts = campaignDrafts;
      }
    } catch (e) {
      // Table doesn't exist, skip
    }

    // Try ads_campaigns (alternative naming)
    if (result.campaigns.length === 0) {
      try {
        const { data: altCampaigns, error: altError } = await supabase
          .from('ads_campaigns')
          .select('id, created_at, status, name, meta_campaign_id, error')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(25);

        if (!altError && altCampaigns) {
          result.campaigns = altCampaigns;
        }
      } catch (e) {
        // Table doesn't exist, skip
      }
    }

    // Try ads_drafts (alternative naming)
    if (result.drafts.length === 0) {
      try {
        const { data: altDrafts, error: altError } = await supabase
          .from('ads_drafts')
          .select('id, created_at, status, name, meta_campaign_id, error')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(25);

        if (!altError && altDrafts) {
          result.drafts = altDrafts;
        }
      } catch (e) {
        // Table doesn't exist, skip
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };
  } catch (e: any) {
    console.error('[ads-debug-scan] Error:', e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: e.message || "scan_error"
      }),
    };
  }
};
