import { Handler } from "@netlify/functions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
    body: JSON.stringify(data),
  };
}

interface RequestBody {
  access_token?: string;
  user_id?: string;
  action?: string;
  userId?: string;
}

interface AdsApiResult {
  endpoint: string;
  success: boolean;
  statusCode: number;
  data?: any;
  error?: string;
  timing: number;
}

export interface MetaDiagnosticsResult {
  adAccounts: number;
  campaigns: number;
  adSets: number;
  ads: number;
  insightsOk: boolean;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  conversions: number;
  results: Record<string, AdsApiResult>;
}

/**
 * Reusable helper to run Meta diagnostics and optionally persist to Supabase
 */
async function runMetaDiagnosticsForUser(
  userId: string,
  supabase: SupabaseClient,
  persistToDb = false
): Promise<MetaDiagnosticsResult> {
  console.log("[runMetaDiagnostics] Starting for user:", userId, "persistToDb:", persistToDb);

  // 1. Get Meta connection from user_meta_connections
  const { data: integration, error: integrationError } = await supabase
    .from("user_meta_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (integrationError) {
    console.error("[runMetaDiagnostics] Error fetching meta connection:", integrationError);
    throw new Error("Failed to check Meta connection");
  }

  if (!integration || !integration.access_token) {
    throw new Error("No Meta integration found or access token missing");
  }

  const accessToken = integration.access_token;

  // Helper to call Graph API
  const callGraph = async (path: string, endpoint: string): Promise<AdsApiResult> => {
    const startTime = Date.now();
    try {
      const url = `https://graph.facebook.com/v19.0${path}${
        path.includes("?") ? "&" : "?"
      }access_token=${encodeURIComponent(accessToken)}`;

      const res = await fetch(url);
      const json = await res.json();
      const timing = Date.now() - startTime;

      console.log(`[runMetaDiagnostics] ${endpoint}:`, res.status);

      return {
        endpoint,
        success: res.ok,
        statusCode: res.status,
        data: json,
        error: res.ok ? undefined : json.error?.message || "API call failed",
        timing,
      };
    } catch (err: any) {
      const timing = Date.now() - startTime;
      console.error(`[runMetaDiagnostics] ${endpoint} error:`, err);
      return {
        endpoint,
        success: false,
        statusCode: 0,
        error: err.message,
        timing,
      };
    }
  };

  // 2. Run diagnostics in parallel
  console.log("[runMetaDiagnostics] Running API checks...");
  const [meResult, adAccountsResult, pagesResult, permsResult] = await Promise.all([
    callGraph("/me?fields=id,name", "/me"),
    callGraph("/me/adaccounts?fields=id,name,account_status,currency", "/me/adaccounts"),
    callGraph(
      "/me/accounts?fields=id,name,instagram_business_account{id,username,profile_picture_url}",
      "/me/accounts"
    ),
    callGraph("/me/permissions", "/me/permissions"),
  ]);

  // 3. Fetch campaigns, adsets, ads, insights from first ad account if available
  let campaignsResult: AdsApiResult | null = null;
  let adsetsResult: AdsApiResult | null = null;
  let adsResult: AdsApiResult | null = null;
  let insightsResult: AdsApiResult | null = null;

  const adAccounts = adAccountsResult.data?.data || [];
  if (adAccounts.length > 0) {
    const firstAdAccountId = adAccounts[0].id;
    console.log("[runMetaDiagnostics] Fetching campaigns/adsets/ads for account:", firstAdAccountId);

    [campaignsResult, adsetsResult, adsResult, insightsResult] = await Promise.all([
      callGraph(
        `/${firstAdAccountId}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget,objective`,
        `/${firstAdAccountId}/campaigns`
      ),
      callGraph(
        `/${firstAdAccountId}/adsets?fields=id,name,status`,
        `/${firstAdAccountId}/adsets`
      ),
      callGraph(`/${firstAdAccountId}/ads?fields=id,name,status`, `/${firstAdAccountId}/ads`),
      callGraph(
        `/${firstAdAccountId}/insights?fields=impressions,clicks,spend,reach,actions`,
        `/${firstAdAccountId}/insights`
      ),
    ]);
  }

  // Build results object
  const results: Record<string, AdsApiResult> = {
    me: meResult,
    adaccounts: adAccountsResult,
    pages: pagesResult,
    permissions: permsResult,
  };

  if (campaignsResult) results.campaigns = campaignsResult;
  if (adsetsResult) results.adsets = adsetsResult;
  if (adsResult) results.ads = adsResult;
  if (insightsResult) results.insights = insightsResult;

  // 4. Calculate summary
  const campaigns = campaignsResult?.data?.data || [];
  const adsets = adsetsResult?.data?.data || [];
  const ads = adsResult?.data?.data || [];
  const insights = insightsResult?.data?.data?.[0] || null;

  // Extract metrics from insights
  const impressions = Number(insights?.impressions || 0);
  const clicks = Number(insights?.clicks || 0);
  const spend = Number(insights?.spend || 0);
  const reach = Number(insights?.reach || 0);

  // Extract conversions from actions if available
  let conversions = 0;
  if (insights?.actions) {
    const conversionAction = insights.actions.find((a: any) =>
      a.action_type === 'offsite_conversion.fb_pixel_purchase' ||
      a.action_type === 'omni_purchase'
    );
    conversions = Number(conversionAction?.value || 0);
  }

  // 5. Optionally persist to Supabase
  if (persistToDb && campaigns.length > 0) {
    console.log("[runMetaDiagnostics] Persisting", campaigns.length, "campaigns to Supabase");

    // Map campaigns to our schema
    const mappedCampaigns = campaigns.map((c: any) => ({
      user_id: userId,
      campaign_id: c.id,
      name: c.name,
      status: c.status || 'UNKNOWN',
      effective_status: c.effective_status || null,
      daily_budget: Number(c.daily_budget || 0) / 100, // Convert cents to dollars
      objective: c.objective || null,
      platform: 'meta',
      impressions: 0, // Will be updated per-campaign if we fetch per-campaign insights
      clicks: 0,
      spend: 0,
      conversions: 0,
    }));

    // Upsert campaigns
    const { error: campaignError } = await supabase
      .from("meta_ad_campaigns")
      .upsert(mappedCampaigns, {
        onConflict: "campaign_id",
        ignoreDuplicates: false,
      });

    if (campaignError) {
      console.error("[runMetaDiagnostics] Error upserting campaigns:", campaignError);
    } else {
      console.log("[runMetaDiagnostics] Successfully upserted campaigns");
    }
  }

  // 6. Return aggregated result
  const diagnosticsResult: MetaDiagnosticsResult = {
    adAccounts: adAccounts.length,
    campaigns: campaigns.length,
    adSets: adsets.length,
    ads: ads.length,
    insightsOk: !!insights,
    impressions,
    clicks,
    spend,
    reach,
    conversions,
    results,
  };

  console.log("[runMetaDiagnostics] Complete:", {
    campaigns: diagnosticsResult.campaigns,
    impressions: diagnosticsResult.impressions,
    clicks: diagnosticsResult.clicks,
    spend: diagnosticsResult.spend,
  });

  return diagnosticsResult;
}

export const handler: Handler = async (event) => {
  console.log("[test-ads-api] Request received");

  // Handle OPTIONS for CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const body: RequestBody = JSON.parse(event.body || "{}");
    const action = body.action || "runDiagnostics";

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("[test-ads-api] Action:", action);

    // Handle different actions
    switch (action) {
      case "runDiagnostics": {
        // Original diagnostics action (used by Dashboard diagnostics card)
        const { access_token: accessToken, user_id: legacyUserId } = body;

        if (!accessToken) {
          console.error("[test-ads-api] Missing access token");
          return jsonResponse(400, {
            success: false,
            message: "Missing access token",
          });
        }

        // For legacy compatibility, if access_token is provided, we still support it
        // but this will be phased out in favor of userId-based calls
        console.log("[test-ads-api] Legacy mode: using provided access_token");

        // We'll need to find the user_id from the access token or use legacyUserId
        // For now, this maintains backward compatibility with the existing Dashboard component

        // Run the old inline logic for now (to maintain backward compatibility)
        const callGraph = async (path: string, endpoint: string): Promise<AdsApiResult> => {
          const startTime = Date.now();
          try {
            const url = `https://graph.facebook.com/v19.0${path}${
              path.includes("?") ? "&" : "?"
            }access_token=${encodeURIComponent(accessToken)}`;

            const res = await fetch(url);
            const json = await res.json();
            const timing = Date.now() - startTime;

            return {
              endpoint,
              success: res.ok,
              statusCode: res.status,
              data: json,
              error: res.ok ? undefined : json.error?.message || "API call failed",
              timing,
            };
          } catch (err: any) {
            const timing = Date.now() - startTime;
            return {
              endpoint,
              success: false,
              statusCode: 0,
              error: err.message,
              timing,
            };
          }
        };

        const [meResult, adAccountsResult, pagesResult, permsResult] = await Promise.all([
          callGraph("/me?fields=id,name", "/me"),
          callGraph("/me/adaccounts?fields=id,name,account_status,currency", "/me/adaccounts"),
          callGraph(
            "/me/accounts?fields=id,name,instagram_business_account{id,username,profile_picture_url}",
            "/me/accounts"
          ),
          callGraph("/me/permissions", "/me/permissions"),
        ]);

        let campaignsResult: AdsApiResult | null = null;
        let adsetsResult: AdsApiResult | null = null;
        let adsResult: AdsApiResult | null = null;
        let insightsResult: AdsApiResult | null = null;

        const adAccounts = adAccountsResult.data?.data || [];
        if (adAccounts.length > 0) {
          const firstAdAccountId = adAccounts[0].id;
          [campaignsResult, adsetsResult, adsResult, insightsResult] = await Promise.all([
            callGraph(
              `/${firstAdAccountId}/campaigns?fields=id,name,status`,
              `/${firstAdAccountId}/campaigns`
            ),
            callGraph(
              `/${firstAdAccountId}/adsets?fields=id,name,status`,
              `/${firstAdAccountId}/adsets`
            ),
            callGraph(`/${firstAdAccountId}/ads?fields=id,name,status`, `/${firstAdAccountId}/ads`),
            callGraph(
              `/${firstAdAccountId}/insights?fields=impressions,clicks,spend,reach`,
              `/${firstAdAccountId}/insights`
            ),
          ]);
        }

        const results: Record<string, AdsApiResult> = {
          me: meResult,
          adaccounts: adAccountsResult,
          pages: pagesResult,
          permissions: permsResult,
        };

        if (campaignsResult) results.campaigns = campaignsResult;
        if (adsetsResult) results.adsets = adsetsResult;
        if (adsResult) results.ads = adsResult;
        if (insightsResult) results.insights = insightsResult;

        const campaigns = campaignsResult?.data?.data || [];
        const adsets = adsetsResult?.data?.data || [];
        const ads = adsResult?.data?.data || [];
        const insights = insightsResult?.data?.data?.[0] || null;

        const summary = {
          adAccountCount: adAccounts.length,
          campaignCount: campaigns.length,
          adsetCount: adsets.length,
          adCount: ads.length,
          hasInsights: !!insights,
          insights: insights || undefined,
        };

        const allSuccess = Object.values(results).every((r) => r.success);

        return jsonResponse(200, {
          success: allSuccess,
          results,
          summary,
          timestamp: new Date().toISOString(),
        });
      }

      case "syncForAdsManager": {
        // New action for Ads Manager Refresh button
        const { userId } = body;

        if (!userId) {
          return jsonResponse(400, {
            success: false,
            message: "Missing userId",
          });
        }

        console.log("[test-ads-api] syncForAdsManager for user:", userId);

        // Run diagnostics AND persist to DB
        const diagnosticsResult = await runMetaDiagnosticsForUser(userId, supabase, true);

        return jsonResponse(200, {
          success: true,
          summary: {
            spend: diagnosticsResult.spend,
            impressions: diagnosticsResult.impressions,
            clicks: diagnosticsResult.clicks,
            conversions: diagnosticsResult.conversions,
            reach: diagnosticsResult.reach,
            campaigns: diagnosticsResult.campaigns,
            adSets: diagnosticsResult.adSets,
            ads: diagnosticsResult.ads,
          },
          timestamp: new Date().toISOString(),
        });
      }

      default:
        return jsonResponse(400, {
          success: false,
          message: `Unknown action: ${action}`,
        });
    }
  } catch (err: any) {
    console.error("[test-ads-api] Unexpected error:", err);
    return jsonResponse(500, {
      success: false,
      message: "Unexpected server error",
      error: err.message,
    });
  }
};
