/**
 * Ghoste AI Mobile SMS Automation Function
 *
 * Sends automated SMS messages for various user interactions.
 * Supports multiple automation types for future extensibility.
 */

import type { Handler } from "@netlify/functions";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !fromNumber) {
  console.warn("[ai-sync-text] Twilio env vars missing");
}

/**
 * SMS Automation Types
 * Add new types here as features expand
 */
type SmsAutomationType =
  | "welcome"
  | "daily_tip"
  | "campaign_reminder"
  | "drop_day_hype";

/**
 * Builds the SMS message body based on automation type
 */
function buildBody(type: SmsAutomationType): string {
  switch (type) {
    case "welcome":
    default:
      return (
        "👋 Hey, it's Ghoste AI.\n" +
        "Nice to meet you! I'm your music marketing assistant inside Ghoste.\n\n" +
        "I can help you:\n" +
        "• Build smart links & email capture pages\n" +
        "• Plan ad campaigns on Meta & TikTok\n" +
        "• Text or email your fans with new drops\n\n" +
        "Reply with ideas or questions anytime and I'll help you turn them into a plan. 💿✨"
      );

    // Future automation types can be added here:
    // case "daily_tip":
    //   return "💡 Daily Ghoste Tip: ...";
    // case "campaign_reminder":
    //   return "🎯 Don't forget to check your active campaigns...";
    // case "drop_day_hype":
    //   return "🚀 Your drop is live! Time to share...";
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    // Check Twilio configuration
    if (!accountSid || !authToken || !fromNumber) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "SMS service not configured" }),
      };
    }

    // Parse request body
    const bodyJson = event.body ? JSON.parse(event.body) : {};
    const to = bodyJson.phone || bodyJson.to;
    const type: SmsAutomationType = bodyJson.type || "welcome";

    if (!to) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing phone number" }),
      };
    }

    // Build message based on automation type
    const smsBody = buildBody(type);

    // Send SMS via Twilio
    const client = twilio(accountSid, authToken);
    const sms = await client.messages.create({
      to,
      from: fromNumber,
      body: smsBody,
    });

    console.log(`[ai-sync-text] SMS sent to ${to}, type: ${type}, SID: ${sms.sid}`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        sid: sms.sid,
        type,
      }),
    };
  } catch (err: any) {
    console.error("[ai-sync-text] Twilio SMS error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err.message || "SMS failed",
      }),
    };
  }
};
