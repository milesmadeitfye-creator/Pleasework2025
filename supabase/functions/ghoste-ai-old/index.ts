import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.67.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://ghoste.one",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle preflight OPTIONS first
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const body = await req.json();
    const userId: string | undefined = body.user_id;
    const messages: Array<{ role: string; content: string }> =
      body.messages ?? [];
    const task: string = body.task ?? "chat";
    let conversationId: string | null = body.conversation_id ?? null;

    console.log("[ghoste-ai edge] body", {
      userId,
      task,
      messageCount: messages.length,
      conversationId,
    });

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing user_id" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No messages provided" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // -------------------------------------------------------------------
    // Supabase client (service role) – do NOT expose this in frontend
    // -------------------------------------------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !openaiKey) {
      console.error("[ghoste-ai edge] missing env vars");
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const openai = new OpenAI({ apiKey: openaiKey });

    // -------------------------------------------------------------------
    // Ensure conversation exists in ghoste_conversations
    // -------------------------------------------------------------------
    if (!conversationId) {
      const { data: conv, error: convError } = await supabaseAdmin
        .from("ghoste_conversations")
        .insert([{ user_id: userId }])
        .select()
        .single();

      if (convError || !conv) {
        console.error(
          "[ghoste-ai edge] failed to create conversation",
          convError
        );
        return new Response(
          JSON.stringify({ error: "Failed to create conversation" }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      conversationId = conv.id;
    }

    const lastUserMessage = messages[messages.length - 1];

    // Store user message in ghoste_messages
    const { error: userMsgError } = await supabaseAdmin
      .from("ghoste_messages")
      .insert([
        {
          conversation_id: conversationId,
          user_id: userId,
          role: "user",
          content: lastUserMessage.content,
        },
      ]);

    if (userMsgError) {
      console.error(
        "[ghoste-ai edge] failed to store user message",
        userMsgError
      );
    }

    // -------------------------------------------------------------------
    // Call OpenAI with conversation history
    // -------------------------------------------------------------------
    const openaiMessages = messages.map((m) => ({
      role:
        m.role === "assistant" || m.role === "system" ? m.role : "user",
      content: m.content,
    }));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: openaiMessages,
    });

    const assistantMessage =
      completion.choices[0]?.message?.content ??
      "Sorry, I couldn't generate a response.";

    // Store assistant message
    const { error: aiMsgError } = await supabaseAdmin
      .from("ghoste_messages")
      .insert([
        {
          conversation_id: conversationId,
          user_id: userId,
          role: "assistant",
          content: assistantMessage,
        },
      ]);

    if (aiMsgError) {
      console.error(
        "[ghoste-ai edge] failed to store assistant message",
        aiMsgError
      );
    }

    return new Response(
      JSON.stringify({
        conversation_id: conversationId,
        message: assistantMessage,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("[ghoste-ai edge] unhandled error", err);
    return new Response(
      JSON.stringify({
        error:
          err && typeof err === "object" && "message" in err
            ? (err as any).message
            : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
