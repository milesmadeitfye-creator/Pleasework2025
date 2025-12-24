import type { Handler, HandlerEvent } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Meta Webhook Handler for Instagram/Facebook DMs
 *
 * Handles incoming messages from Meta platforms
 * Tracks inbound DM events in fan_comms_events table
 */

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: "" };
  }

  if (event.httpMethod === "GET") {
    const params = new URLSearchParams(event.rawQuery || "");
    const mode = params.get("hub.mode");
    const token = params.get("hub.verify_token");
    const challenge = params.get("hub.challenge");

    const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || "ghoste_meta_verify_2024";

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/plain" },
        body: challenge || "",
      };
    }

    return {
      statusCode: 403,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: "Forbidden" }),
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const supabase = getSupabaseAdmin();
    const payload = JSON.parse(event.body || "{}");

    if (!payload.object || !payload.entry) {
      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ received: true }),
      };
    }

    for (const entry of payload.entry) {
      if (!entry.messaging) continue;

      for (const messaging of entry.messaging) {
        const senderId = messaging.sender?.id;
        const recipientId = messaging.recipient?.id;
        const messageData = messaging.message;

        if (!senderId || !recipientId || !messageData) continue;

        const { data: connection } = await supabase
          .from("user_meta_connections")
          .select("user_id, meta_page_id, meta_instagram_id")
          .or(`meta_page_id.eq.${recipientId},meta_instagram_id.eq.${recipientId}`)
          .maybeSingle();

        if (!connection) {
          console.log("[meta-webhook] No connection found for recipient:", recipientId);
          continue;
        }

        const ownerId = connection.user_id;
        const platform = connection.meta_page_id === recipientId ? "facebook" : "instagram";

        const { data: conversation, error: convError } = await supabase
          .from("fan_dm_conversations")
          .upsert({
            owner_user_id: ownerId,
            platform,
            platform_thread_id: messaging.sender.id,
            platform_user_id: senderId,
            last_message_at: new Date().toISOString(),
          }, {
            onConflict: "owner_user_id,platform_thread_id",
          })
          .select()
          .single();

        if (convError || !conversation) {
          console.error("[meta-webhook] Failed to create/update conversation:", convError);
          continue;
        }

        const messageText = messageData.text || "";
        const attachments = messageData.attachments || [];

        const { data: message, error: msgError } = await supabase
          .from("fan_dm_messages")
          .insert({
            owner_user_id: ownerId,
            conversation_id: conversation.id,
            direction: "inbound",
            platform_message_id: messageData.mid || null,
            content: messageText,
            attachments: attachments.length > 0 ? attachments : null,
            sent_at: new Date(messaging.timestamp || Date.now()).toISOString(),
          })
          .select()
          .single();

        if (msgError || !message) {
          console.error("[meta-webhook] Failed to insert message:", msgError);
          continue;
        }

        await supabase.from("fan_comms_events").insert({
          owner_user_id: ownerId,
          source: "dm",
          platform,
          conversation_id: conversation.id,
          message_id: message.id,
          event_type: "inbound",
          event_ts: new Date(messaging.timestamp || Date.now()).toISOString(),
          meta: {
            sender_id: senderId,
            thread_id: messaging.sender.id,
            message_id: messageData.mid,
            has_attachments: attachments.length > 0,
          },
        });

        console.log(`[meta-webhook] Processed inbound ${platform} DM:`, message.id);

        // Trigger automation runner (non-blocking)
        try {
          const siteUrl = process.env.URL || `https://${event.headers.host}`;
          fetch(`${siteUrl}/.netlify/functions/fan-automation-runner`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId: conversation.id,
              owner_user_id: ownerId,
              inboundText: messageText,
            }),
          }).catch((err) => console.log("[meta-webhook] Runner call failed (non-blocking):", err.message));
        } catch (err) {
          console.log("[meta-webhook] Runner invocation error (non-blocking):", err);
        }
      }
    }

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ received: true }),
    };
  } catch (error: any) {
    console.error("[meta-webhook] Error:", error);
    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};

export { handler };
