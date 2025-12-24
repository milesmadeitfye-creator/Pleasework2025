import type { Handler, HandlerEvent } from "@netlify/functions";
import {
  createServiceSupabase,
  getUserIdFromRequest,
} from "./_supabaseMailchimpUtils";

const FB_API_VERSION = "v20.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const userId = await getUserIdFromRequest(event);

    if (!userId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: "not_authenticated" }),
      };
    }

    const supabase = createServiceSupabase();

    const { data, error } = await supabase
      .from("meta_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[meta-ads-assets] Supabase error:", error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "db_error" }),
      };
    }

    if (!data) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ connected: false }),
      };
    }

    const accessToken = data.access_token as string;

    console.log("[meta-ads-assets] Fetching ad accounts for user:", userId);

    // Fetch ad accounts
    const accountsUrl = `https://graph.facebook.com/${FB_API_VERSION}/me/adaccounts?fields=id,account_id,name,account_status,currency,timezone_name&limit=100`;
    const accountsRes = await fetch(accountsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!accountsRes.ok) {
      const text = await accountsRes.text();
      console.error("[meta-ads-assets] Ad accounts fetch failed:", {
        status: accountsRes.status,
        body: text,
      });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          connected: false,
          error: "meta_token_invalid",
        }),
      };
    }

    const accountsJson = await accountsRes.json();
    const adAccounts = accountsJson.data || [];

    console.log("[meta-ads-assets] Found", adAccounts.length, "ad accounts");

    // Optionally fetch pages if needed
    let pages: any[] = [];
    try {
      const pagesUrl = `https://graph.facebook.com/${FB_API_VERSION}/me/accounts?fields=id,name,access_token,picture&limit=100`;
      const pagesRes = await fetch(pagesUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (pagesRes.ok) {
        const pagesJson = await pagesRes.json();
        pages = pagesJson.data || [];
        console.log("[meta-ads-assets] Found", pages.length, "pages");
      }
    } catch (err) {
      console.warn("[meta-ads-assets] Failed to fetch pages (non-fatal):", err);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        connected: true,
        ad_accounts: adAccounts.map((a: any) => ({
          id: a.id,
          account_id: a.account_id,
          name: a.name,
          currency: a.currency,
          account_status: a.account_status,
          timezone_name: a.timezone_name,
          raw: a,
        })),
        pages: pages.map((p: any) => ({
          id: p.id,
          name: p.name,
          access_token: p.access_token,
          picture: p.picture?.data?.url,
        })),
      }),
    };
  } catch (err: any) {
    console.error("[meta-ads-assets] Unexpected error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "unknown", message: err.message }),
    };
  }
};
