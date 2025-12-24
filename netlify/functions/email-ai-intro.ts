/**
 * Email AI Intro
 * Sends Ghoste AI introduction 24 hours after signup
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
      console.error("[email-ai-intro] Mailgun not configured");
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Email service not configured" }),
      };
    }

    const actions = [
      "Generate content ideas",
      "Create smart links",
      "Analyze your fans",
      "Run automated SMS follow-ups",
    ];

    await client.messages.create(MAILGUN_DOMAIN, {
      from: "Ghoste AI <ai@mg.ghostemedia.com>",
      to: email,
      subject: "Meet your Ghoste AI Assistant 🤖✨",
      template: "ghoste_ai_intro",
      "h:X-Mailgun-Variables": JSON.stringify({
        username: username || "Artist",
        actions,
      }),
    });

    console.log(`[email-ai-intro] AI intro email sent to ${email}`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  } catch (err: any) {
    console.error("[email-ai-intro] Error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Failed to send email" }),
    };
  }
};
