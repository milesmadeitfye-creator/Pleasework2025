import type { Handler, HandlerEvent } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Send DM to Fan via Meta platforms
 *
 * Sends messages to Instagram/Facebook and tracks in fan_comms_events
 */

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: "" };
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

    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const userId = user.id;
    const body = JSON.parse(event.body || "{}");
    const { conversation_id, message } = body;

    if (!conversation_id || !message) {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Missing conversation_id or message" }),
      };
    }

    const { data: conversation, error: convError } = await supabase
      .from("fan_dm_conversations")
      .select("*")
      .eq("id", conversation_id)
      .eq("owner_user_id", userId)
      .single();

    if (convError || !conversation) {
      return {
        statusCode: 404,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Conversation not found" }),
      };
    }

    const { data: metaConnection, error: metaError } = await supabase
      .from("user_meta_connections")
      .select("access_token, meta_page_id, meta_instagram_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (metaError || !metaConnection?.access_token) {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Meta not connected" }),
      };
    }

    const platform = conversation.platform;
    const pageId = platform === "instagram" ? metaConnection.meta_instagram_id : metaConnection.meta_page_id;

    if (!pageId) {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: `${platform} account not configured` }),
      };
    }

    const endpoint = `https://graph.facebook.com/v18.0/${pageId}/messages`;
    const graphResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${metaConnection.access_token}`,
      },
      body: JSON.stringify({
        recipient: { id: conversation.platform_user_id },
        message: { text: message },
      }),
    });

    if (!graphResponse.ok) {
      const errorData = await graphResponse.json().catch(() => ({}));
      console.error("[fan-send-message] Meta API error:", errorData);
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          error: "Failed to send message",
          details: errorData,
        }),
      };
    }

    const graphResult = await graphResponse.json();

    const { data: dmMessage, error: msgError } = await supabase
      .from("fan_dm_messages")
      .insert({
        owner_user_id: userId,
        conversation_id: conversation.id,
        direction: "outbound",
        platform_message_id: graphResult.message_id || null,
        content: message,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (msgError || !dmMessage) {
      console.error("[fan-send-message] Failed to save message:", msgError);
      return {
        statusCode: 500,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Failed to save message" }),
      };
    }

    await supabase.from("fan_comms_events").insert({
      owner_user_id: userId,
      source: "dm",
      platform,
      conversation_id: conversation.id,
      message_id: dmMessage.id,
      event_type: "sent",
      event_ts: new Date().toISOString(),
      meta: {
        platform_message_id: graphResult.message_id,
        recipient_id: graphResult.recipient_id,
        thread_id: conversation.platform_thread_id,
      },
    });

    await supabase
      .from("fan_dm_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        success: true,
        ok: true,
        message_id: dmMessage.id,
        platform_message_id: graphResult.message_id,
      }),
    };
  } catch (error: any) {
    console.error("[fan-send-message] Error:", error);
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
