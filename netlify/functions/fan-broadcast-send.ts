import type { Handler, HandlerEvent } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Send broadcast to multiple conversations
 *
 * POST /fan-broadcast-send
 * Body: { broadcast_id: string }
 *
 * Resolves audience segment, creates send records, and dispatches messages
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
        headers: RESPONSE_HEADERS,
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
    const { broadcast_id } = body;

    if (!broadcast_id) {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "broadcast_id is required" }),
      };
    }

    // Fetch broadcast
    const { data: broadcast, error: broadcastError } = await supabase
      .from("fan_broadcasts")
      .select("*")
      .eq("id", broadcast_id)
      .eq("owner_user_id", userId)
      .single();

    if (broadcastError || !broadcast) {
      return {
        statusCode: 404,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Broadcast not found" }),
      };
    }

    if (broadcast.status !== 'draft' && broadcast.status !== 'scheduled') {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Broadcast already sent or in progress" }),
      };
    }

    // Update status to sending
    await supabase
      .from("fan_broadcasts")
      .update({ status: 'sending' })
      .eq("id", broadcast_id);

    // Get template body if using template
    let messageBody = broadcast.body_override;
    if (!messageBody && broadcast.template_id) {
      const { data: template } = await supabase
        .from("fan_templates")
        .select("body")
        .eq("id", broadcast.template_id)
        .single();

      if (template) {
        messageBody = template.body;
      }
    }

    if (!messageBody) {
      await supabase
        .from("fan_broadcasts")
        .update({ status: 'failed' })
        .eq("id", broadcast_id);

      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "No message body found" }),
      };
    }

    // Resolve audience segment
    const audience = broadcast.audience as any || {};
    let query = supabase
      .from("fan_dm_conversations")
      .select("id, fan_name, fan_username, platform, platform_user_id, last_inbound_at")
      .eq("owner_user_id", userId);

    // Apply filters
    if (audience.tags && audience.tags.length > 0) {
      const { data: taggedConversations } = await supabase
        .from("fan_dm_conversation_tags")
        .select("conversation_id")
        .in("tag_id", audience.tags);

      if (taggedConversations) {
        const conversationIds = taggedConversations.map((t) => t.conversation_id);
        query = query.in("id", conversationIds);
      }
    }

    if (audience.platform) {
      query = query.eq("platform", audience.platform);
    }

    if (audience.has_24h_window) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("last_inbound_at", twentyFourHoursAgo);
    }

    const { data: conversations, error: conversationsError } = await query;

    if (conversationsError || !conversations || conversations.length === 0) {
      await supabase
        .from("fan_broadcasts")
        .update({ status: 'failed', failed_count: 0, sent_count: 0 })
        .eq("id", broadcast_id);

      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "No conversations match the audience criteria" }),
      };
    }

    // Check Meta connection
    const { data: metaConnection } = await supabase
      .from("user_meta_connections")
      .select("access_token, meta_page_id, meta_instagram_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!metaConnection?.access_token) {
      await supabase
        .from("fan_broadcasts")
        .update({ status: 'failed' })
        .eq("id", broadcast_id);

      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Meta not connected. Connect Meta in settings to send broadcasts." }),
      };
    }

    // Create broadcast send records
    const broadcastSends = conversations.map((conv) => ({
      owner_user_id: userId,
      broadcast_id: broadcast_id,
      conversation_id: conv.id,
      status: 'pending',
    }));

    await supabase.from("fan_broadcast_sends").insert(broadcastSends);

    // Send messages sequentially with rate limiting
    let sentCount = 0;
    let failedCount = 0;

    for (const conv of conversations) {
      try {
        // Variable substitution
        let personalizedMessage = messageBody;
        const firstName = conv.fan_name?.split(' ')[0] || conv.fan_username || 'there';
        personalizedMessage = personalizedMessage.replace(/\{\{first_name\}\}/g, firstName);

        // Send via Meta Graph API
        const pageId = conv.platform === "instagram"
          ? metaConnection.meta_instagram_id
          : metaConnection.meta_page_id;

        if (!pageId || !conv.platform_user_id) {
          throw new Error("Missing page_id or platform_user_id");
        }

        const endpoint = `https://graph.facebook.com/v18.0/${pageId}/messages`;
        const graphResponse = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${metaConnection.access_token}`,
          },
          body: JSON.stringify({
            recipient: { id: conv.platform_user_id },
            message: { text: personalizedMessage },
          }),
        });

        if (!graphResponse.ok) {
          const errorData = await graphResponse.json().catch(() => ({}));
          throw new Error(errorData.error?.message || "Meta API error");
        }

        const graphResult = await graphResponse.json();

        // Update send record
        await supabase
          .from("fan_broadcast_sends")
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq("broadcast_id", broadcast_id)
          .eq("conversation_id", conv.id);

        // Save message to history
        await supabase
          .from("fan_dm_messages")
          .insert({
            owner_user_id: userId,
            conversation_id: conv.id,
            direction: "outbound",
            platform_message_id: graphResult.message_id || null,
            text: personalizedMessage,
            content: personalizedMessage,
            sent_at: new Date().toISOString(),
          });

        // Log event
        await supabase.from("fan_comms_events").insert({
          owner_user_id: userId,
          source: "broadcast",
          platform: conv.platform,
          conversation_id: conv.id,
          event_type: "sent",
          event_ts: new Date().toISOString(),
          meta: { broadcast_id, platform_message_id: graphResult.message_id },
        });

        sentCount++;

        // Rate limiting: 200ms delay between sends
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error: any) {
        console.error(`[fan-broadcast-send] Failed to send to ${conv.id}:`, error);

        await supabase
          .from("fan_broadcast_sends")
          .update({
            status: 'failed',
            error: error.message,
            sent_at: new Date().toISOString(),
          })
          .eq("broadcast_id", broadcast_id)
          .eq("conversation_id", conv.id);

        failedCount++;
      }
    }

    // Update broadcast final status
    await supabase
      .from("fan_broadcasts")
      .update({
        status: failedCount === conversations.length ? 'failed' : 'sent',
        sent_count: sentCount,
        failed_count: failedCount,
      })
      .eq("id", broadcast_id);

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        success: true,
        sent_count: sentCount,
        failed_count: failedCount,
        total: conversations.length,
      }),
    };
  } catch (error: any) {
    console.error("[fan-broadcast-send] Error:", error);
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
