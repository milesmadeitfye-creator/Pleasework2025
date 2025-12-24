/**
 * Send 2FA SMS Code
 * Generates a 6-digit code and sends it via Twilio
 */

import type { Handler } from "@netlify/functions";
import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const { userId } = JSON.parse(event.body || "{}");

    if (!userId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing userId" }),
      };
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("phone, two_factor_enabled")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "User not found" }),
      };
    }

    if (!profile.two_factor_enabled || !profile.phone) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "2FA not enabled or no phone number" }),
      };
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store code with 10-minute expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({
        two_factor_code: code,
        two_factor_code_expires_at: expiresAt,
      })
      .eq("id", userId);

    if (updateError) {
      console.error("[send-2fa-code] DB update error:", updateError);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to store code" }),
      };
    }

    // Send SMS
    try {
      await twilioClient.messages.create({
        to: profile.phone,
        from: process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER!,
        body: `Your Ghoste AI security code is ${code}. It expires in 10 minutes.`,
      });

      console.log(`[send-2fa-code] Code sent to ${profile.phone}`);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true }),
      };
    } catch (twilioError: any) {
      console.error("[send-2fa-code] Twilio error:", twilioError);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to send SMS" }),
      };
    }
  } catch (err: any) {
    console.error("[send-2fa-code] Error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Internal error" }),
    };
  }
};
