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

const FALLBACK_MAILCHIMP_DC =
  process.env.MAILCHIMP_DEFAULT_DC || "us13";

type MailchimpConnection = {
  id: string;
  user_id: string;
  access_token: string;
  server_prefix?: string | null;
  data_center?: string | null;
  dc?: string | null;
  default_list_id?: string | null;
};

async function withMailchimpApi(
  rawConnection: any,
  supabase: ReturnType<typeof createClient>
) {
  const connection = rawConnection as MailchimpConnection;

  if (!connection.access_token) {
    throw new Error("Mailchimp access token missing");
  }

  const server_prefix =
    connection.server_prefix ||
    connection.data_center ||
    connection.dc ||
    FALLBACK_MAILCHIMP_DC;

  if (!server_prefix) {
    console.error("[Mailchimp] No data center found on connection:", connection);
    throw new Error("Mailchimp data center not configured");
  }

  console.log(`[Mailchimp Send] Using data center: ${server_prefix}`);

  const apiBase = `https://${server_prefix}.api.mailchimp.com/3.0`;

  const mcFetch = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.access_token}`,
        ...(init?.headers || {}),
      },
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Mailchimp API error:", path, json);
      throw new Error(json.detail || json.title || "Mailchimp API error");
    }
    return json;
  };

  async function ensureDefaultListId(
    existingListId?: string | null
  ): Promise<string> {
    if (existingListId && existingListId.trim().length > 0) {
      return existingListId;
    }

    const listsResp = await mcFetch(`/lists?count=1&offset=0`);
    if (listsResp.total_items > 0 && listsResp.lists?.[0]?.id) {
      const listId = listsResp.lists[0].id as string;

      await supabase
        .from("mailchimp_connections")
        .update({ default_list_id: listId })
        .eq("id", connection.id)
        .then(() => {
          console.log(`[Mailchimp Send] Using existing list: ${listId}`);
        })
        .catch((err) => {
          console.error("Failed to update default_list_id:", err);
        });

      return listId;
    }

    const created = await mcFetch(`/lists`, {
      method: "POST",
      body: JSON.stringify({
        name: "Ghoste Fans",
        permission_reminder:
          "You are receiving this email because you signed up via Ghoste.",
        email_type_option: false,
        contact: {
          company: "Ghoste",
          address1: "N/A",
          city: "N/A",
          state: "N/A",
          zip: "00000",
          country: "US",
        },
        campaign_defaults: {
          from_name: "Ghoste",
          from_email: "no-reply@ghoste.one",
          subject: "",
          language: "en",
        },
      }),
    });

    const listId = created.id as string;

    await supabase
      .from("mailchimp_connections")
      .update({ default_list_id: listId })
      .eq("id", connection.id)
      .then(() => {
        console.log(`[Mailchimp Send] Created new list: ${listId}`);
      })
      .catch((err) => {
        console.error("Failed to update default_list_id:", err);
      });

    return listId;
  }

  return { mcFetch, ensureDefaultListId };
}

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

    const { subject, html, from_name, reply_to } = event.body
      ? JSON.parse(event.body)
      : {};

    if (!subject || !html) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing subject or html" }),
      };
    }

    // Use the same table as Connected Accounts page (user_integrations)
    const { data: integration, error: connError } = await supabase
      .from("user_integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "mailchimp")
      .maybeSingle();

    if (connError) {
      console.error("[Mailchimp Send] Connection fetch error:", connError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Failed to load Mailchimp connection" }),
      };
    }

    if (!integration || !integration.is_active) {
      console.warn("[Mailchimp Send] Mailchimp not connected", {
        userId,
        hasIntegration: !!integration,
        isActive: integration?.is_active,
      });
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Mailchimp not connected for this user" }),
      };
    }

    // Map user_integrations fields to MailchimpConnection format
    const connection: MailchimpConnection = {
      ...integration,
      // Support both legacy and new field names
      access_token: integration.access_token || integration.api_key,
      api_key: integration.api_key || integration.access_token,
      server_prefix: integration.server_prefix || integration.mailchimp_dc,
      mailchimp_dc: integration.mailchimp_dc || integration.server_prefix,
    } as MailchimpConnection;

    const { mcFetch, ensureDefaultListId } = await withMailchimpApi(
      connection,
      supabase
    );

    const listId = await ensureDefaultListId(connection.default_list_id);

    // Get sender email from mailchimp_lists or fetch from Mailchimp API
    let senderEmail = "no-reply@ghoste.one";
    let senderName = from_name || "Ghoste";

    try {
      // First try to get from our stored mailchimp_lists
      const { data: listSettings } = await supabase
        .from("mailchimp_lists")
        .select("from_email, from_name")
        .eq("user_id", userId)
        .eq("list_id", listId)
        .maybeSingle();

      if (listSettings?.from_email) {
        senderEmail = listSettings.from_email;
        senderName = listSettings.from_name || senderName;
      } else {
        // Fall back to fetching from Mailchimp API
        const listDetails = await mcFetch(`/lists/${listId}`);
        if (listDetails?.campaign_defaults?.from_email) {
          senderEmail = listDetails.campaign_defaults.from_email;
          senderName = listDetails.campaign_defaults.from_name || senderName;
        }
      }
    } catch (listErr) {
      console.warn("[Mailchimp Send] Could not fetch sender email, using fallback:", listErr);
    }

    if (senderEmail === "no-reply@ghoste.one") {
      console.warn("[Mailchimp Send] Using fallback sender email - may fail if not verified in Mailchimp");
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "NO_SENDER_EMAIL",
          message: "No verified sender email found. Please configure a verified sender email in your Mailchimp account settings.",
        }),
      };
    }

    const campaign = await mcFetch(`/campaigns`, {
      method: "POST",
      body: JSON.stringify({
        type: "regular",
        recipients: {
          list_id: listId,
        },
        settings: {
          subject_line: subject,
          from_name: senderName,
          reply_to: reply_to || senderEmail,
        },
      }),
    });

    const campaignId = campaign.id as string;

    console.log(`[Mailchimp Send] Created campaign: ${campaignId}`);

    await mcFetch(`/campaigns/${campaignId}/content`, {
      method: "PUT",
      body: JSON.stringify({ html }),
    });

    console.log(`[Mailchimp Send] Set campaign content`);

    await mcFetch(`/campaigns/${campaignId}/actions/send`, {
      method: "POST",
    });

    console.log(`[Mailchimp Send] Campaign sent: ${campaignId}`);

    // Persist campaign to database
    const { data: messageRecord, error: insertError } = await supabase
      .from('fan_messages')
      .insert({
        user_id: userId,
        channel: 'mailchimp_email',
        subject: subject,
        body_html: html,
        content: html.substring(0, 500),
        type: 'email',
        mailchimp_campaign_id: campaignId,
        mailchimp_list_id: listId,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Mailchimp Send] Failed to persist message:', insertError);
    } else {
      console.log('[Mailchimp Send] Message persisted:', messageRecord?.id);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        campaign_id: campaignId,
        message: messageRecord || null,
      }),
    };
  } catch (err: any) {
    console.error("[Mailchimp Send] Error:", err);

    const errorMessage = err?.message || "mailchimp-send-message failed";
    const errorLower = errorMessage.toLowerCase();

    // Check for specific Mailchimp errors and provide helpful messages
    if (errorLower.includes("address") || errorLower.includes("from_email") || errorLower.includes("from_name")) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "INVALID_SENDER",
          message: "Your Mailchimp sender email is not verified. Please verify the From email address in your Mailchimp account settings before sending campaigns.",
          details: errorMessage,
        }),
      };
    }

    if (errorLower.includes("not ready to send") || errorLower.includes("campaign") && errorLower.includes("send")) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "CAMPAIGN_NOT_READY",
          message: "Your campaign is not ready to send. This usually means the sender email is not verified in Mailchimp. Please check your Mailchimp account settings.",
          details: errorMessage,
        }),
      };
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "SEND_FAILED",
        message: errorMessage,
      }),
    };
  }
};
