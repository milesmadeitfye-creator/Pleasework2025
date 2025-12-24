/**
 * Centralized Email Sending via Mailgun HTTP API
 *
 * Features:
 * - Supports US/EU regions
 * - Clear logging with request IDs
 * - Detailed error messages
 * - Tags support for tracking
 * - CC/BCC support
 *
 * Usage from other functions/client:
 * POST /.netlify/functions/send-email
 * {
 *   to: "user@example.com" or ["user1@example.com", "user2@example.com"],
 *   subject: "Your subject",
 *   html: "<p>HTML content</p>",
 *   text: "Plain text fallback",
 *   replyTo: "support@ghoste.one",
 *   tags: ["split_invite", "production"]
 * }
 */

import type { Handler } from "@netlify/functions";

type EmailBody = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;

  // optional fields
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  tags?: string[]; // Mailgun tags for tracking
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function toArray(v?: string | string[]) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export const handler: Handler = async (event) => {
  // Generate unique request ID for tracing
  const reqId = crypto?.randomUUID?.() || `req_${Date.now()}`;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method Not Allowed", reqId }),
      };
    }

    // Get environment variables
    const API_KEY = process.env.MAILGUN_API_KEY;
    const DOMAIN = process.env.MAILGUN_DOMAIN;
    const FROM_NAME = process.env.MAILGUN_FROM_NAME || "Ghoste One";
    const FROM_EMAIL = process.env.MAILGUN_FROM_EMAIL;
    const REGION = (process.env.MAILGUN_REGION || "us").toLowerCase();
    const DEFAULT_REPLY_TO = process.env.MAILGUN_REPLY_TO;

    // Validate environment
    if (!API_KEY || !DOMAIN || !FROM_EMAIL) {
      console.error("[send-email] Missing environment variables", {
        reqId,
        hasKey: !!API_KEY,
        hasDomain: !!DOMAIN,
        hasFromEmail: !!FROM_EMAIL,
      });
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "missing_env",
          message: "Mailgun not configured. Check MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM_EMAIL.",
          reqId,
        }),
      };
    }

    // Parse request body
    const body: EmailBody = JSON.parse(event.body || "{}");
    const to = toArray(body.to);

    // Validate request
    if (!to.length || !body.subject || (!body.text && !body.html)) {
      console.error("[send-email] Invalid request", { reqId, hasTo: to.length > 0, hasSubject: !!body.subject, hasContent: !!(body.text || body.html) });
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "missing_fields",
          message: "Required: to, subject, and either text or html",
          reqId,
        }),
      };
    }

    // Build Mailgun endpoint (US or EU)
    const endpoint =
      REGION === "eu"
        ? `https://api.eu.mailgun.net/v3/${DOMAIN}/messages`
        : `https://api.mailgun.net/v3/${DOMAIN}/messages`;

    // Build form data
    const form = new URLSearchParams();
    form.set("from", `${FROM_NAME} <${FROM_EMAIL}>`);
    form.set("to", to.join(","));
    form.set("subject", body.subject);

    if (body.text) form.set("text", body.text);
    if (body.html) form.set("html", body.html);

    // Add optional fields
    const replyTo = body.replyTo || DEFAULT_REPLY_TO;
    if (replyTo) form.set("h:Reply-To", replyTo);

    const cc = toArray(body.cc);
    const bcc = toArray(body.bcc);
    if (cc.length) form.set("cc", cc.join(","));
    if (bcc.length) form.set("bcc", bcc.join(","));

    // Add tags for tracking
    (body.tags || []).forEach((t) => form.append("o:tag", t));

    // Build authorization header
    const auth = Buffer.from(`api:${API_KEY}`).toString("base64");

    console.log("[send-email] Sending email", {
      reqId,
      to: to.join(", "),
      subject: body.subject,
      region: REGION,
      tags: body.tags,
    });

    // Send via Mailgun HTTP API
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const dataText = await resp.text();

    if (!resp.ok) {
      console.error("[send-email] Mailgun error", {
        reqId,
        status: resp.status,
        response: dataText,
        to: to.join(", "),
        subject: body.subject,
      });
      return {
        statusCode: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "mailgun_failed",
          message: "Mailgun API returned an error",
          reqId,
          status: resp.status,
          details: dataText,
        }),
      };
    }

    console.log("[send-email] Email sent successfully", {
      reqId,
      to: to.join(", "),
      subject: body.subject,
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        reqId,
        message: "Email sent successfully",
        details: dataText,
      }),
    };
  } catch (e: any) {
    console.error("[send-email] Server error", {
      reqId,
      error: e?.message || String(e),
      stack: e?.stack,
    });
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "server_error",
        message: e?.message || "An unexpected error occurred",
        reqId,
      }),
    };
  }
};
