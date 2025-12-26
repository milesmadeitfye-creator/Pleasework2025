import type { Handler, HandlerEvent } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
};

/**
 * Enroll or unenroll conversation in sequence
 *
 * POST /fan-sequence-enroll - Enroll conversation in sequence
 * DELETE /fan-sequence-enroll?id=xxx - Unenroll (pause enrollment)
 */

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: "" };
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

    // POST - Enroll conversation
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { sequence_id, conversation_id } = body;

      if (!sequence_id || !conversation_id) {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "sequence_id and conversation_id are required" }),
        };
      }

      // Verify sequence exists and belongs to user
      const { data: sequence, error: sequenceError } = await supabase
        .from("fan_sequences")
        .select("id, name, status")
        .eq("id", sequence_id)
        .eq("owner_user_id", userId)
        .single();

      if (sequenceError || !sequence) {
        return {
          statusCode: 404,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Sequence not found" }),
        };
      }

      if (sequence.status !== 'active') {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Sequence must be active to enroll conversations" }),
        };
      }

      // Verify conversation exists and belongs to user
      const { data: conversation, error: convError } = await supabase
        .from("fan_dm_conversations")
        .select("id, fan_name, fan_username")
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

      // Check if already enrolled
      const { data: existingEnrollment } = await supabase
        .from("fan_sequence_enrollments")
        .select("id, status")
        .eq("sequence_id", sequence_id)
        .eq("conversation_id", conversation_id)
        .maybeSingle();

      if (existingEnrollment && existingEnrollment.status === 'active') {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Conversation already enrolled in this sequence" }),
        };
      }

      // Create enrollment
      const { data: enrollment, error: enrollError } = await supabase
        .from("fan_sequence_enrollments")
        .insert({
          owner_user_id: userId,
          sequence_id,
          conversation_id,
          current_step_index: 0,
          status: 'active',
        })
        .select()
        .single();

      if (enrollError || !enrollment) {
        return {
          statusCode: 500,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: enrollError?.message || "Failed to enroll" }),
        };
      }

      // Get first step
      const { data: firstStep } = await supabase
        .from("fan_sequence_steps")
        .select(`
          *,
          template:fan_templates(body)
        `)
        .eq("sequence_id", sequence_id)
        .eq("step_index", 0)
        .maybeSingle();

      if (!firstStep) {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Sequence has no steps" }),
        };
      }

      // Send first message immediately if wait_minutes is 0
      if (firstStep.wait_minutes === 0) {
        const messageBody = firstStep.body_override || firstStep.template?.body;

        if (messageBody) {
          // Variable substitution
          let personalizedMessage = messageBody;
          const firstName = conversation.fan_name?.split(' ')[0] || conversation.fan_username || 'there';
          personalizedMessage = personalizedMessage.replace(/\{\{first_name\}\}/g, firstName);

          // Get Meta connection
          const { data: metaConnection } = await supabase
            .from("user_meta_connections")
            .select("access_token, meta_page_id, meta_instagram_id")
            .eq("user_id", userId)
            .maybeSingle();

          if (metaConnection?.access_token) {
            // Get conversation details for sending
            const { data: fullConversation } = await supabase
              .from("fan_dm_conversations")
              .select("*")
              .eq("id", conversation_id)
              .single();

            if (fullConversation) {
              const pageId = fullConversation.platform === "instagram"
                ? metaConnection.meta_instagram_id
                : metaConnection.meta_page_id;

              if (pageId && fullConversation.platform_user_id) {
                try {
                  const endpoint = `https://graph.facebook.com/v18.0/${pageId}/messages`;
                  const graphResponse = await fetch(endpoint, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${metaConnection.access_token}`,
                    },
                    body: JSON.stringify({
                      recipient: { id: fullConversation.platform_user_id },
                      message: { text: personalizedMessage },
                    }),
                  });

                  if (graphResponse.ok) {
                    const graphResult = await graphResponse.json();

                    // Save message
                    await supabase
                      .from("fan_dm_messages")
                      .insert({
                        owner_user_id: userId,
                        conversation_id,
                        direction: "outbound",
                        platform_message_id: graphResult.message_id || null,
                        text: personalizedMessage,
                        content: personalizedMessage,
                        sent_at: new Date().toISOString(),
                      });

                    // Advance to next step
                    await supabase
                      .from("fan_sequence_enrollments")
                      .update({ current_step_index: 1 })
                      .eq("id", enrollment.id);
                  }
                } catch (error) {
                  console.error("[fan-sequence-enroll] Error sending first step:", error);
                }
              }
            }
          }
        }
      }

      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          success: true,
          enrollment,
        }),
      };
    }

    // DELETE - Pause enrollment
    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id;

      if (!id) {
        return {
          statusCode: 400,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: "Enrollment ID is required" }),
        };
      }

      const { error } = await supabase
        .from("fan_sequence_enrollments")
        .update({ status: 'paused' })
        .eq("id", id)
        .eq("owner_user_id", userId);

      if (error) {
        return {
          statusCode: 500,
          headers: RESPONSE_HEADERS,
          body: JSON.stringify({ error: error.message }),
        };
      }

      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ success: true }),
      };
    }

    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  } catch (error: any) {
    console.error("[fan-sequence-enroll] Error:", error);
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
