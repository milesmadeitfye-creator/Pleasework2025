/**
 * Twilio SMS Send Function
 *
 * Sends SMS messages via Twilio.
 * Credits are charged on the frontend before calling this function.
 * This keeps auth.uid() context for spend_credits RPC.
 */

import type { Handler } from "@netlify/functions";
import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const fromNumber = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER!;

const client = twilio(accountSid, authToken);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
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

    console.log(`[twilio-send-sms] Request from user: ${user.id}`);
    const body = JSON.parse(event.body || "{}");
    const { toNumbers, message } = body;

    if (!toNumbers || !Array.isArray(toNumbers) || toNumbers.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing toNumbers array" }),
      };
    }

    if (!message || typeof message !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing message" }),
      };
    }

    const results: { to: string; sid: string }[] = [];
    const errors: { to: string; error: string }[] = [];

    for (const to of toNumbers) {
      try {
        const res = await client.messages.create({
          from: fromNumber,
          to,
          body: message,
        });

        results.push({ to, sid: res.sid });
      } catch (err: any) {
        console.error(`Failed to send SMS to ${to}:`, err);
        errors.push({ to, error: err.message || String(err) });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        count: results.length,
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
    console.error("[twilio-send-sms] error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err.message || String(err),
      }),
    };
  }
};
