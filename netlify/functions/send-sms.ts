/**
 * Simple SMS Send Function
 *
 * Sends a single SMS via Twilio to a single recipient.
 * Requires authentication via Supabase JWT.
 */

import type { Handler } from "@netlify/functions";
import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !fromNumber) {
  console.warn("[send-sms] Twilio env vars missing");
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    // Check Twilio configuration
    if (!accountSid || !authToken || !fromNumber) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Twilio not configured" }),
      };
    }

    // Auth guard - require authenticated user
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized - Missing auth token" }),
      };
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized - Invalid token" }),
      };
    }

    console.log(`[send-sms] Request from user: ${user.id}`);

    // Parse request body
    const body = event.body ? JSON.parse(event.body) : {};
    const to = body.to as string | undefined;
    const message = body.message as string | undefined;

    if (!to || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing 'to' or 'message' fields" }),
      };
    }

    // Send SMS via Twilio
    const client = twilio(accountSid, authToken);
    const sms = await client.messages.create({
      to,
      from: fromNumber,
      body: message,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, sid: sms.sid }),
    };
  } catch (error: any) {
    console.error("[send-sms] Twilio SMS error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to send SMS",
        details: error.message ?? String(error),
      }),
    };
  }
};
