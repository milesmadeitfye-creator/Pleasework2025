import type { Handler, HandlerEvent } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { getMailchimpConnection, makeMailchimpError } from "./_mailchimp";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Sync Mailchimp campaigns and cache metrics
 *
 * Fetches recent campaigns from Mailchimp API and stores metrics in cache table
 * This avoids hitting Mailchimp API on every Fan Pulse page load
 */

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const userId = user.id;

    const mailchimpConnection = await getMailchimpConnection(supabase, userId);

    if (!mailchimpConnection) {
      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          ok: false,
          error: "MAILCHIMP_NOT_CONNECTED",
          message: "Mailchimp account not connected",
        }),
      };
    }

    if (!mailchimpConnection.access_token) {
      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          ok: false,
          error: "MAILCHIMP_NO_TOKEN",
          message: "Mailchimp access token missing",
        }),
      };
    }

    const serverPrefix =
      mailchimpConnection.server_prefix ||
      mailchimpConnection.data_center ||
      mailchimpConnection.dc ||
      "us13";

    const apiBase = `https://${serverPrefix}.api.mailchimp.com/3.0`;

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const campaignsUrl = `${apiBase}/campaigns?count=100&status=sent&since_send_time=${sixtyDaysAgo.toISOString()}`;

    const campaignsResponse = await fetch(campaignsUrl, {
      headers: {
        Authorization: `Bearer ${mailchimpConnection.access_token}`,
      },
    });

    if (!campaignsResponse.ok) {
      const errorJson = await campaignsResponse.json().catch(() => ({}));
      console.error("[mailchimp-sync] Failed to fetch campaigns:", errorJson);
      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          ok: false,
          error: "MAILCHIMP_API_ERROR",
          message: errorJson.detail || "Failed to fetch campaigns from Mailchimp",
        }),
      };
    }

    const campaignsData = await campaignsResponse.json();
    const campaigns = campaignsData.campaigns || [];

    let syncedCount = 0;

    for (const campaign of campaigns) {
      try {
        const reportUrl = `${apiBase}/reports/${campaign.id}`;
        const reportResponse = await fetch(reportUrl, {
          headers: {
            Authorization: `Bearer ${mailchimpConnection.access_token}`,
          },
        });

        if (!reportResponse.ok) {
          console.warn(`[mailchimp-sync] Failed to fetch report for campaign ${campaign.id}`);
          continue;
        }

        const report = await reportResponse.json();

        await supabase.from("mailchimp_campaign_cache").upsert(
          {
            owner_user_id: userId,
            campaign_id: campaign.id,
            title: campaign.settings?.title || campaign.settings?.subject_line || "Untitled",
            subject_line: campaign.settings?.subject_line || null,
            status: campaign.status || "sent",
            send_time: campaign.send_time || null,
            emails_sent: report.emails_sent || 0,
            unique_opens: report.opens?.unique_opens || 0,
            opens_total: report.opens?.opens_total || 0,
            unique_clicks: report.clicks?.unique_subscriber_clicks || 0,
            clicks_total: report.clicks?.clicks_total || 0,
            unsubscribes: report.unsubscribed || 0,
            bounces: report.bounces?.hard_bounces || 0,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "owner_user_id,campaign_id" }
        );

        syncedCount++;
      } catch (err) {
        console.error(`[mailchimp-sync] Error syncing campaign ${campaign.id}:`, err);
      }
    }

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        ok: true,
        campaigns: syncedCount,
        total: campaigns.length,
      }),
    };
  } catch (error: any) {
    console.error("[mailchimp-sync] Error:", error);
    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};

export { handler };
