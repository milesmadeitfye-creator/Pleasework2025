import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Verify Mailgun signature if you set MAILGUN_WEBHOOK_SIGNING_KEY
function verifySignature(signingKey: string, timestamp: string, token: string, signature: string) {
  const hmac = crypto.createHmac("sha256", signingKey);
  hmac.update(timestamp + token);
  return hmac.digest("hex") === signature;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method not allowed" };
    }

    const bodyRaw = event.body || "";

    // Mailgun webhooks are usually form-encoded
    const params = new URLSearchParams(bodyRaw);

    // Signature verify (recommended)
    const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
    if (signingKey) {
      const timestamp = params.get("timestamp") || "";
      const token = params.get("token") || "";
      const signature = params.get("signature") || "";
      const ok = verifySignature(signingKey, timestamp, token, signature);
      if (!ok) return { statusCode: 401, body: "Invalid signature" };
    }

    const eventName = params.get("event") || "unknown";
    const recipient = params.get("recipient") || null;
    const msgIdRaw = params.get("Message-Id") || params.get("message-id") || null;

    const msgId = msgIdRaw ? String(msgIdRaw).replace(/[<>]/g, "") : null;

    const url = params.get("url") || null;
    const ua = params.get("user-agent") || null;
    const ip = params.get("ip") || null;

    // Store raw event (best effort)
    await supabase.from("mailgun_events").insert({
      mailgun_message_id: msgId,
      event: eventName,
      recipient,
      timestamp: new Date().toISOString(),
      ip,
      user_agent: ua,
      url,
      raw: Object.fromEntries(params.entries()),
    });

    return { statusCode: 200, body: "ok" };
  } catch (e: any) {
    console.error("[mailgun-webhook] error:", e);
    return { statusCode: 200, body: "ok" }; // don't retry storm
  }
};
