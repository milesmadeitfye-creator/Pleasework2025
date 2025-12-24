/**
 * Fan Automation Runner
 * File: netlify/functions/fan-automation-runner.ts
 *
 * Executes fan automation workflows when triggered by inbound messages or tests
 */
import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const RESPONSE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const handler: Handler = async (event) => {
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
    const body = JSON.parse(event.body || "{}");
    const { conversationId, owner_user_id, inboundText } = body;

    if (!conversationId) {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ success: false, error: "conversationId required" }),
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get conversation details
    const { data: conversation, error: convError } = await supabase
      .from("fan_dm_conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      return {
        statusCode: 404,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ success: false, error: "Conversation not found" }),
      };
    }

    const ownerId = owner_user_id || conversation.owner_user_id;

    // Get latest inbound message if not provided
    let messageText = inboundText;
    if (!messageText) {
      const { data: latestMsg } = await supabase
        .from("fan_dm_messages")
        .select("text")
        .eq("conversation_id", conversationId)
        .eq("direction", "inbound")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      messageText = latestMsg?.text || "";
    }

    // Get active automations for this user
    const { data: automations, error: autoError } = await supabase
      .from("fan_dm_automations")
      .select(`
        *,
        nodes:fan_dm_automation_nodes(*),
        edges:fan_dm_automation_edges(*)
      `)
      .eq("owner_user_id", ownerId)
      .eq("status", "active");

    if (autoError || !automations || automations.length === 0) {
      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          success: true,
          message: "No active automations found",
          matched: 0,
          executed: 0,
        }),
      };
    }

    const results: any[] = [];
    let totalExecuted = 0;

    // Process each automation
    for (const automation of automations) {
      const triggerNode = automation.nodes.find((n: any) => n.kind === "trigger");
      if (!triggerNode) continue;

      // Check if trigger matches
      let matches = false;
      const triggerConfig = triggerNode.config;

      if (triggerConfig.type === "inbound_message_received") {
        matches = true;
      } else if (triggerConfig.type === "keyword" && messageText) {
        const keyword = triggerConfig.keyword?.toLowerCase() || "";
        const textLower = messageText.toLowerCase();

        if (triggerConfig.match_mode === "exact") {
          matches = textLower === keyword;
        } else {
          matches = textLower.includes(keyword);
        }
      }

      if (!matches) {
        continue;
      }

      // Create automation run
      const { data: run } = await supabase
        .from("fan_dm_automation_runs")
        .insert([
          {
            automation_id: automation.id,
            conversation_id: conversationId,
            status: "running",
            cursor_node_id: triggerNode.id,
          },
        ])
        .select()
        .single();

      if (!run) continue;

      const actionNodes = automation.nodes.filter((n: any) => n.kind === "action");
      const executedActions: string[] = [];
      const blockedActions: string[] = [];
      let error: string | null = null;

      // Execute actions in order
      for (const actionNode of actionNodes) {
        const actionConfig = actionNode.config;

        try {
          if (actionConfig.type === "send_message") {
            // Check if sending is allowed (24h window + opt-ins)
            const canSend = await checkSendPermission(supabase, conversationId);

            if (!canSend) {
              blockedActions.push(`send_message: Outside 24h window and no opt-in`);
              continue;
            }

            // Send message
            await supabase.from("fan_dm_messages").insert([
              {
                conversation_id: conversationId,
                owner_user_id: ownerId,
                direction: "outbound",
                message_type: "text",
                text: actionConfig.text || "",
              },
            ]);

            executedActions.push(`send_message: "${actionConfig.text}"`);
          } else if (actionConfig.type === "add_tag") {
            // Ensure tag exists
            const tagName = actionConfig.tag_name || "untitled";
            let { data: tag } = await supabase
              .from("fan_dm_tags")
              .select("id")
              .eq("owner_user_id", ownerId)
              .eq("name", tagName)
              .maybeSingle();

            if (!tag) {
              const { data: newTag } = await supabase
                .from("fan_dm_tags")
                .insert([{ owner_user_id: ownerId, name: tagName }])
                .select()
                .single();

              tag = newTag;
            }

            if (tag) {
              // Add tag to conversation
              await supabase
                .from("fan_dm_conversation_tags")
                .insert([{ conversation_id: conversationId, tag_id: tag.id }])
                .onConflict("conversation_id,tag_id")
                .ignoreDuplicates();

              executedActions.push(`add_tag: "${tagName}"`);
            }
          } else if (actionConfig.type === "grant_optin") {
            // Grant opt-in
            const optinType = actionConfig.optin_type || "otn";
            const optinTopic = actionConfig.optin_topic || "";

            let expiresAt = null;
            if (optinType === "24h") {
              expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            }

            await supabase.from("fan_dm_opt_ins").insert([
              {
                owner_user_id: ownerId,
                conversation_id: conversationId,
                type: optinType,
                topic: optinTopic || null,
                granted_at: new Date().toISOString(),
                expires_at: expiresAt,
                source: "automation",
                consumed: false,
              },
            ]);

            executedActions.push(`grant_optin: ${optinType} ${optinTopic ? `(${optinTopic})` : ""}`);
          }
        } catch (err: any) {
          error = err.message;
          console.error(`[Automation Runner] Action error:`, err);
          break;
        }
      }

      // Update run status
      await supabase
        .from("fan_dm_automation_runs")
        .update({
          status: error ? "failed" : "done",
          error: error || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id);

      results.push({
        automation_id: automation.id,
        automation_name: automation.name,
        matched: true,
        executed: executedActions,
        blocked: blockedActions,
        error,
      });

      totalExecuted += executedActions.length;
    }

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        success: true,
        message: `Executed ${totalExecuted} actions from ${results.length} automations`,
        matched: results.length,
        executed: totalExecuted,
        results,
      }),
    };
  } catch (err: any) {
    console.error("[Automation Runner] Fatal error:", err);

    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        success: false,
        error: "Automation runner failed",
        message: err.message || String(err),
      }),
    };
  }
};

/**
 * Check if sending is allowed based on 24h window + opt-ins
 */
async function checkSendPermission(supabase: any, conversationId: string): Promise<boolean> {
  // Get conversation
  const { data: conversation } = await supabase
    .from("fan_dm_conversations")
    .select("last_inbound_at")
    .eq("id", conversationId)
    .single();

  if (!conversation) return false;

  // Check 24h window
  if (conversation.last_inbound_at) {
    const lastInbound = new Date(conversation.last_inbound_at);
    const now = new Date();
    const hoursSince = (now.getTime() - lastInbound.getTime()) / (1000 * 60 * 60);

    if (hoursSince < 24) {
      return true; // Within 24h window
    }
  }

  // Check for valid opt-ins
  const { data: optins } = await supabase
    .from("fan_dm_opt_ins")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("consumed", false)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString());

  if (optins && optins.length > 0) {
    // Consume one-time opt-ins
    const otnOptins = optins.filter((o: any) => o.type === "otn");
    if (otnOptins.length > 0) {
      await supabase
        .from("fan_dm_opt_ins")
        .update({ consumed: true })
        .eq("id", otnOptins[0].id);
    }

    return true;
  }

  return false;
}
