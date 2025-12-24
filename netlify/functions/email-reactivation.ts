/**
 * Email Reactivation
 * Sends reactivation email 3 days after signup if user hasn't engaged
 */

import type { Handler } from "@netlify/functions";
import Mailgun from "mailgun.js";
import formData from "form-data";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const mg = new Mailgun(formData);
const client = mg.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY || "",
  url: process.env.MAILGUN_BASE_URL || "https://api.mailgun.net",
});

const MAILGUN_DOMAIN = "mg.ghostemedia.com";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const { userId, email, username } = JSON.parse(event.body || "{}");

    if (!email || !userId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing email or userId" }),
      };
    }

    if (!process.env.MAILGUN_API_KEY) {
      console.error("[email-reactivation] Mailgun not configured");
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Email service not configured" }),
      };
    }

    // Check user engagement
    const { data: links } = await supabase
      .from("links")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    const { data: integrations } = await supabase
      .from("user_integrations")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    // If user has created links or connected integrations, don't send reactivation
    if (links?.length || integrations?.length) {
      console.log(`[email-reactivation] User ${userId} is active, skipping`);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, skipped: true, reason: "User is active" }),
      };
    }

    await client.messages.create(MAILGUN_DOMAIN, {
      from: "Ghoste <hello@mg.ghostemedia.com>",
      to: email,
      subject: "Need help with your next step?",
      template: "ghoste_reactivate",
      "h:X-Mailgun-Variables": JSON.stringify({
        username: username || "Artist",
      }),
    });

    console.log(`[email-reactivation] Reactivation email sent to ${email}`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  } catch (err: any) {
    console.error("[email-reactivation] Error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Failed to send email" }),
    };
  }
};
