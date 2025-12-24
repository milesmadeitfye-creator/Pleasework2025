/**
 * Email Activation 30min
 * Sends activation reminder 30 minutes after signup
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
    const { email, username } = JSON.parse(event.body || "{}");

    if (!email) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing email" }),
      };
    }

    if (!process.env.MAILGUN_API_KEY) {
      console.error("[email-activation-30min] Mailgun not configured");
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Email service not configured" }),
      };
    }

    const nextSteps = [
      "Connect your Spotify artist page",
      "Add your phone number for Ghoste AI Mobile",
      "Make your first Smart Link",
      "Sync Mailchimp",
    ];

    await client.messages.create(MAILGUN_DOMAIN, {
      from: "Ghoste <hello@mg.ghostemedia.com>",
      to: email,
      subject: "You're almost set — finish setting up your Ghoste account",
      template: "ghoste_activation_30min",
      "h:X-Mailgun-Variables": JSON.stringify({
        username: username || "Artist",
        nextSteps,
      }),
    });

    console.log(`[email-activation-30min] Activation email sent to ${email}`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  } catch (err: any) {
    console.error("[email-activation-30min] Error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Failed to send email" }),
    };
  }
};
