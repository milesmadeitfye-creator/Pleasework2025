/**
 * Fan SMS Broadcast Function
 *
 * Sends SMS messages to fan contacts via Twilio.
 * Spends Manager credits before sending.
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

// Feature cost definition
const FEATURE_KEY = "fan_broadcast_sms";
const FEATURE_COST = {
  pool: "manager",
  amount: 1200,
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Parse request
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Invalid token" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const { toNumbers, message } = body;

    if (!Array.isArray(toNumbers) || toNumbers.length === 0 || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields: toNumbers (array) and message (string)",
        }),
      };
    }

    // Spend credits (or skip in dev mode)
    let spendError = null;

    if (!UNLIMITED_WALLET_DEV_MODE) {
      const { error } = await supabase.rpc(
        "spend_credits",
        {
          p_pool: FEATURE_COST.pool,
          p_amount: FEATURE_COST.amount,
          p_feature_key: FEATURE_KEY,
        }
      );
      spendError = error;
    } else {
      console.log("[fan-sms-send] DEV MODE: Skipping credit spend");
    }

    if (spendError) {
      console.error("[fan-sms-send] Credit spend failed:", spendError);

      if (spendError.message.includes("INSUFFICIENT")) {
        return {
          statusCode: 402,
          body: JSON.stringify({
            error: "NOT_ENOUGH_CREDITS",
            message: "Not enough Manager credits to send SMS broadcast. Top up your wallet.",
          }),
        };
      }

      if (spendError.message.includes("PRO")) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            error: "PRO_REQUIRED",
            message: "SMS broadcasts require Ghoste Pro.",
          }),
        };
      }

      return {
        statusCode: 500,
        body: JSON.stringify({ error: "CREDIT_SPEND_FAILED" }),
      };
    }

    // Check if Twilio is configured
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER) {
      console.error("[fan-sms-send] Twilio not configured");
      return {
        statusCode: 503,
        body: JSON.stringify({
          error: "SMS_NOT_CONFIGURED",
          message: "SMS service is not yet configured. Contact support.",
        }),
      };
    }

    // Send SMS via Twilio (dynamic import to avoid errors if not installed)
    let twilioClient;
    try {
      const twilio = await import("twilio");
      twilioClient = twilio.default(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    } catch (err) {
      console.error("[fan-sms-send] Twilio SDK not installed:", err);
      return {
        statusCode: 503,
        body: JSON.stringify({
          error: "SMS_SDK_MISSING",
          message: "SMS SDK is not installed. Contact support.",
        }),
      };
    }

    const from = process.env.TWILIO_FROM_NUMBER;
    const results = [];
    const errors = [];

    for (const to of toNumbers) {
      try {
        const res = await twilioClient.messages.create({
          from,
          to,
          body: message,
        });
        results.push({ sid: res.sid, to, status: res.status });
      } catch (err: any) {
        console.error(`[fan-sms-send] Failed to send to ${to}:`, err);
        errors.push({ to, error: err.message || String(err) });
      }
    }

    // Log to database
    await supabase.from("sms_logs").insert({
      user_id: user.id,
      recipients_count: toNumbers.length,
      success_count: results.length,
      failed_count: errors.length,
      message_preview: message.substring(0, 100),
      feature_key: FEATURE_KEY,
      credits_spent: FEATURE_COST.amount,
    }).catch((err) => console.error("[fan-sms-send] Failed to log:", err));

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        results,
        errors,
        summary: {
          total: toNumbers.length,
          sent: results.length,
          failed: errors.length,
        },
      }),
    };
  } catch (err: any) {
    console.error("[fan-sms-send] Unexpected error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};
