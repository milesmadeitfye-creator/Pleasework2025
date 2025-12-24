/**
 * Mailchimp Fan Email Blast Function
 *
 * Sends email campaigns to Mailchimp audiences/lists.
 * This is the function Ghoste AI and manual UI use for fan email blasts.
 * Credits are charged before sending.
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

/**
 * TEMPORARY DEV MODE - Bypass all credit checks for testing
 * TODO: Remove this flag once we're ready to enforce real credit limits
 */
const UNLIMITED_WALLET_DEV_MODE = true;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY!;
const MAILCHIMP_SERVER_PREFIX = process.env.MAILCHIMP_SERVER_PREFIX!; // e.g. us21

const featureKey = "fan_broadcast_email";
const FEATURE_COST = {
  pool: "manager",
  amount: 1000,
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { userId, listId, segmentId, subject, html, fromName, replyTo } = body;

    if (!userId || !listId || !subject || !html) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields (userId, listId, subject, html)",
        }),
      };
    }

    // 1) Charge credits via RPC (or skip in dev mode)
    let spendError = null;

    if (!UNLIMITED_WALLET_DEV_MODE) {
      const { error } = await supabase.rpc(
        "spend_credits",
        {
          p_pool: FEATURE_COST.pool,
          p_amount: FEATURE_COST.amount,
          p_feature_key: featureKey,
        }
      );
      spendError = error;
    } else {
      console.log("[mailchimp-fan-email-blast] DEV MODE: Skipping credit spend");
    }

    if (spendError) {
      console.error("[mailchimp-fan-email-blast] Credit spend error:", spendError);

      if (spendError.message.includes("INSUFFICIENT")) {
        return {
          statusCode: 402,
          body: JSON.stringify({
            error: "NOT_ENOUGH_CREDITS",
            message: "Not enough Manager credits to send this email blast.",
          }),
        };
      }

      if (spendError.message.includes("PRO")) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            error: "PRO_REQUIRED",
            message: "Email blasts require Ghoste Pro.",
          }),
        };
      }

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "CREDIT_SPEND_FAILED",
          details: spendError.message,
        }),
      };
    }

    // 2) Create Mailchimp campaign
    const baseUrl = `https://${MAILCHIMP_SERVER_PREFIX}.api.mailchimp.com/3.0`;

    const campaignPayload: any = {
      type: "regular",
      recipients: {
        list_id: listId,
      },
      settings: {
        subject_line: subject,
        title: subject,
        reply_to: replyTo || "no-reply@ghoste.one",
        from_name: fromName || "Ghoste Artist",
      },
    };

    if (segmentId) {
      campaignPayload.recipients.segment_opts = {
        saved_segment_id: parseInt(segmentId, 10),
      };
    }

    const campaignRes = await fetch(`${baseUrl}/campaigns`, {
      method: "POST",
      headers: {
        Authorization: `apikey ${MAILCHIMP_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(campaignPayload),
    });

    const campaignJson = await campaignRes.json();

    if (!campaignRes.ok) {
      console.error("[mailchimp-fan-email-blast] Campaign creation error:", campaignJson);
      return {
        statusCode: campaignRes.status,
        body: JSON.stringify({
          error: "MAILCHIMP_CAMPAIGN_ERROR",
          details: campaignJson,
        }),
      };
    }

    const campaignId = campaignJson.id;

    // 3) Set campaign content
    const contentRes = await fetch(
      `${baseUrl}/campaigns/${campaignId}/content`,
      {
        method: "PUT",
        headers: {
          Authorization: `apikey ${MAILCHIMP_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ html }),
      }
    );

    const contentJson = await contentRes.json();

    if (!contentRes.ok) {
      console.error("[mailchimp-fan-email-blast] Content set error:", contentJson);
      return {
        statusCode: contentRes.status,
        body: JSON.stringify({
          error: "MAILCHIMP_CONTENT_ERROR",
          details: contentJson,
        }),
      };
    }

    // 4) Send campaign
    const sendRes = await fetch(
      `${baseUrl}/campaigns/${campaignId}/actions/send`,
      {
        method: "POST",
        headers: {
          Authorization: `apikey ${MAILCHIMP_API_KEY}`,
        },
      }
    );

    if (!sendRes.ok) {
      const sendJson = await sendRes.json();
      console.error("[mailchimp-fan-email-blast] Send error:", sendJson);
      return {
        statusCode: sendRes.status,
        body: JSON.stringify({
          error: "MAILCHIMP_SEND_ERROR",
          details: sendJson,
        }),
      };
    }

    // 5) Log to database
    await supabase.from("fan_messages").insert({
      user_id: userId,
      type: "email",
      subject,
      content: html.substring(0, 500),
      recipient_count: campaignJson.recipients?.recipient_count || 0,
      sent_at: new Date().toISOString(),
    }).catch((err) => console.error("[mailchimp-fan-email-blast] Log error:", err));

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        campaignId,
        recipientCount: campaignJson.recipients?.recipient_count || 0,
      }),
    };
  } catch (err: any) {
    console.error("[mailchimp-fan-email-blast] Unexpected error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "INTERNAL_ERROR",
        details: err.message || String(err),
      }),
    };
  }
};
