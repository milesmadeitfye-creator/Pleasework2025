import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "./_headers";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const FALLBACK_MAILCHIMP_DC = process.env.MAILCHIMP_DEFAULT_DC || "us13";

type MailchimpConnection = {
  id: string;
  user_id: string;
  access_token: string;
  server_prefix?: string | null;
  data_center?: string | null;
  dc?: string | null;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Supabase not configured" }),
    };
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing authorization header" }),
      };
    }

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Invalid or expired token" }),
      };
    }

    const userId = user.id;

    const { campaign_id } = event.body ? JSON.parse(event.body) : {};

    if (!campaign_id) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing campaign_id" }),
      };
    }

    // Get the campaign from database
    const { data: message, error: messageError } = await supabase
      .from("fan_messages")
      .select("*")
      .eq("user_id", userId)
      .eq("mailchimp_campaign_id", campaign_id)
      .maybeSingle();

    if (messageError) {
      console.error("[Mailchimp Stats] Error fetching message:", messageError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Failed to fetch message" }),
      };
    }

    if (!message) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Campaign not found" }),
      };
    }

    // Get user's Mailchimp connection
    const { data: integration, error: connError } = await supabase
      .from("user_integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "mailchimp")
      .maybeSingle();

    if (connError || !integration || !integration.is_active) {
      console.error("[Mailchimp Stats] Mailchimp not connected", {
        userId,
        hasIntegration: !!integration,
        isActive: integration?.is_active,
      });
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Mailchimp not connected" }),
      };
    }

    // Map user_integrations fields to MailchimpConnection format
    const connection: MailchimpConnection = {
      ...integration,
      access_token: integration.access_token || integration.api_key,
      server_prefix: integration.server_prefix || integration.mailchimp_dc,
    } as MailchimpConnection;

    const serverPrefix =
      connection.server_prefix ||
      connection.data_center ||
      connection.dc ||
      FALLBACK_MAILCHIMP_DC;

    if (!serverPrefix) {
      console.error("[Mailchimp Stats] No data center found");
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Mailchimp data center not configured" }),
      };
    }

    console.log(`[Mailchimp Stats] Fetching report for campaign: ${campaign_id}`);

    // Fetch campaign report from Mailchimp API
    const reportUrl = `https://${serverPrefix}.api.mailchimp.com/3.0/reports/${campaign_id}`;

    const reportRes = await fetch(reportUrl, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.access_token}`,
      },
    });

    if (!reportRes.ok) {
      const errorJson = await reportRes.json().catch(() => ({}));
      console.error("[Mailchimp Stats] Report fetch error:", errorJson);

      // Campaign may not have stats yet if just sent
      if (reportRes.status === 404) {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            message: "Campaign stats not available yet. Try again in a few minutes.",
            stats: {
              emails_sent: 0,
              open_rate: 0,
              click_rate: 0,
            },
          }),
        };
      }

      return {
        statusCode: reportRes.status,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Failed to fetch campaign report",
          details: errorJson,
        }),
      };
    }

    const report = await reportRes.json();

    console.log("[Mailchimp Stats] Report fetched:", {
      campaign_id,
      emails_sent: report.emails_sent,
      open_rate: report.open_rate,
      click_rate: report.click_rate,
    });

    // Extract stats
    const emailsSent = report.emails_sent || 0;
    const openRate = report.open_rate
      ? parseFloat((report.open_rate * 100).toFixed(2))
      : 0;
    const clickRate = report.click_rate
      ? parseFloat((report.click_rate * 100).toFixed(2))
      : 0;

    // Update fan_messages record with stats
    const { data: updatedMessage, error: updateError } = await supabase
      .from("fan_messages")
      .update({
        emails_sent: emailsSent,
        open_rate: openRate,
        click_rate: clickRate,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", message.id)
      .select()
      .single();

    if (updateError) {
      console.error("[Mailchimp Stats] Failed to update message:", updateError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Failed to update stats" }),
      };
    }

    console.log("[Mailchimp Stats] Stats synced successfully");

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: updatedMessage,
        stats: {
          emails_sent: emailsSent,
          open_rate: openRate,
          click_rate: clickRate,
        },
      }),
    };
  } catch (err: any) {
    console.error("[Mailchimp Stats] Unexpected error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "INTERNAL_ERROR",
        message: err.message || String(err),
      }),
    };
  }
};
