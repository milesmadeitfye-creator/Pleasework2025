/**
 * Email Welcome Automation
 * Sends welcome email immediately after signup via Mailgun
 */

import type { Handler } from "@netlify/functions";
import Mailgun from "mailgun.js";
import formData from "form-data";

const mg = new Mailgun(formData);
const client = mg.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY || "",
  url: process.env.MAILGUN_BASE_URL || "https://api.mailgun.net",
});

const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || "mg.ghostemedia.com";
const FROM_EMAIL = process.env.FROM_EMAIL || "Ghoste One <noreply@ghoste.one>";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const { email, username } = JSON.parse(event.body || "{}");

    if (!email) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing email" }),
      };
    }

    if (!process.env.MAILGUN_API_KEY) {
      console.error("[email-welcome] Mailgun not configured");
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Email service not configured" }),
      };
    }

    await client.messages.create(MAILGUN_DOMAIN, {
      from: FROM_EMAIL,
      to: email,
      subject: "Welcome to Ghoste 🎵 Let's get you set up",
      template: "ghoste_welcome_v1",
      "h:X-Mailgun-Variables": JSON.stringify({ username: username || "Artist" }),
    });

    console.log(`[email-welcome] Welcome email sent to ${email}`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  } catch (err: any) {
    console.error("[email-welcome] Error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Failed to send email" }),
    };
  }
};
