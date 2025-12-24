import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GRAPH_VERSION = "v21.0";

interface AdsApiResult {
  endpoint: string;
  success: boolean;
  statusCode: number;
  data?: any;
  error?: string;
  timing: number;
}

async function logToSupabase(
  userId: string,
  endpoint: string,
  success: boolean,
  statusCode: number,
  response: any
) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from("ads_api_logs").insert({
      user_id: userId,
      endpoint,
      success,
      status_code: statusCode,
      response,
    });
  } catch (err) {
    console.error("[test-ads-api] Failed to log to Supabase:", err);
  }
}

async function fetchAdsEndpoint(
  url: string,
  endpoint: string,
  userId: string
): Promise<AdsApiResult> {
  const start = Date.now();
  try {
    console.log(`[test-ads-api] Fetching ${endpoint}:`, url);

    const response = await fetch(url);
    const statusCode = response.status;
    const timing = Date.now() - start;

    let data: any;
    try {
      data = await response.json();
    } catch {
      data = { error: "Failed to parse JSON response" };
    }

    const success = response.ok && !data.error;

    // Log to Supabase
    await logToSupabase(userId, endpoint, success, statusCode, data);

    console.log(`[test-ads-api] ${endpoint} result:`, {
      success,
      statusCode,
      hasData: !!data.data,
      timing: `${timing}ms`,
    });

    return {
      endpoint,
      success,
      statusCode,
      data,
      error: data.error?.message || (response.ok ? undefined : "Request failed"),
      timing,
    };
  } catch (err: any) {
    const timing = Date.now() - start;
    console.error(`[test-ads-api] ${endpoint} exception:`, err.message);

    const errorResponse = {
      error: {
        message: err.message,
        type: "exception",
      },
    };

    await logToSupabase(userId, endpoint, false, 0, errorResponse);

    return {
      endpoint,
      success: false,
      statusCode: 0,
      error: err.message,
      timing,
    };
  }
}

export const handler: Handler = async (event) => {
  console.log("[test-ads-api] Starting Ads API diagnostics");

  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const { access_token, user_id, ad_account_id } = body;

    if (!access_token) {
      console.error("[test-ads-api] Missing access_token");
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "missing_access_token" }),
      };
    }

    if (!user_id) {
      console.error("[test-ads-api] Missing user_id");
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "missing_user_id" }),
      };
    }

    console.log("[test-ads-api] Config:", {
      hasToken: !!access_token,
      userId: user_id,
      hasAdAccountId: !!ad_account_id,
    });

    const results: Record<string, AdsApiResult> = {};

    // 1) Fetch ad accounts
    const adAccountsUrl = `https://graph.facebook.com/${GRAPH_VERSION}/me/adaccounts?access_token=${encodeURIComponent(
      access_token
    )}`;
    results.adaccounts = await fetchAdsEndpoint(adAccountsUrl, "adaccounts", user_id);

    // Check if user has ad accounts
    const adAccounts = results.adaccounts.data?.data || [];
    if (adAccounts.length === 0) {
      console.log("[test-ads-api] User has no ad accounts, skipping deeper calls");
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          message: "User has no ad accounts",
          results: {
            adaccounts: results.adaccounts,
          },
          summary: {
            adAccountCount: 0,
            campaignCount: 0,
            adsetCount: 0,
            adCount: 0,
            hasInsights: false,
          },
        }),
      };
    }

    // Use first ad account for further calls
    const firstAdAccount = ad_account_id || adAccounts[0].id;
    console.log("[test-ads-api] Using ad account:", firstAdAccount);

    // Ensure ad account ID has "act_" prefix
    const actId = firstAdAccount.startsWith("act_")
      ? firstAdAccount
      : `act_${firstAdAccount}`;

    // 2) Fetch campaigns
    const campaignsUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${actId}/campaigns?limit=25&access_token=${encodeURIComponent(
      access_token
    )}`;
    results.campaigns = await fetchAdsEndpoint(campaignsUrl, "campaigns", user_id);

    // 3) Fetch ad sets
    const adsetsUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${actId}/adsets?limit=25&access_token=${encodeURIComponent(
      access_token
    )}`;
    results.adsets = await fetchAdsEndpoint(adsetsUrl, "adsets", user_id);

    // 4) Fetch ads
    const adsUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${actId}/ads?limit=25&access_token=${encodeURIComponent(
      access_token
    )}`;
    results.ads = await fetchAdsEndpoint(adsUrl, "ads", user_id);

    // 5) Fetch insights
    const insightsUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${actId}/insights?fields=impressions,clicks,spend,reach&access_token=${encodeURIComponent(
      access_token
    )}`;
    results.insights = await fetchAdsEndpoint(insightsUrl, "insights", user_id);

    // Calculate summary
    const summary = {
      adAccountCount: adAccounts.length,
      campaignCount: results.campaigns.data?.data?.length || 0,
      adsetCount: results.adsets.data?.data?.length || 0,
      adCount: results.ads.data?.data?.length || 0,
      hasInsights: results.insights.success && !!results.insights.data?.data,
      insights: results.insights.data?.data?.[0] || null,
    };

    const allSuccess = Object.values(results).every((r) => r.success);

    console.log("[test-ads-api] Diagnostics complete:", {
      allSuccess,
      summary,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: allSuccess,
        results,
        summary,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err: any) {
    console.error("[test-ads-api] Fatal error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "server_error",
        message: err.message,
      }),
    };
  }
};
