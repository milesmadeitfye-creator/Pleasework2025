import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4.67.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  // Handle OPTIONS for CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
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
    // Parse request body
    const body = await req.json();
    const userId: string | undefined = body.user_id;
    const task: string = body.task ?? "chat";
    const payload: any = body.payload ?? {};
    const messages: Array<{ role: string; content: string }> = body.messages ?? [];
    let conversationId: string | null = body.conversation_id ?? null;

    console.log("[ghoste-ai] Request received:", {
      userId,
      task,
      hasPayload: !!payload,
      messageCount: messages.length,
      conversationId,
    });

    // Validate user_id
    if (!userId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing user_id"
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !openaiKey) {
      console.error("[ghoste-ai] Missing environment variables");
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Server misconfigured - missing environment variables"
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

    // Initialize clients
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const openai = new OpenAI({ apiKey: openaiKey });

    // -------------------------------------------------------------------
    // TASK: COVER ART IMAGE GENERATION
    // -------------------------------------------------------------------
    if (task === "cover_art_image") {
      console.log("[ghoste-ai] Handling cover art generation");

      const prompt = payload.prompt;
      const style = payload.style || "moody";

      if (!prompt || !prompt.trim()) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Missing prompt for cover art generation",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      // Build enhanced prompt with style
      const enhancedPrompt = `Create a professional album cover art image: ${prompt}. Style: ${style}. High quality, artistic, suitable for music streaming platforms.`;

      console.log("[ghoste-ai] Generating image with prompt:", enhancedPrompt.substring(0, 100));

      try {
        // Generate image using DALL-E 3
        const imageResponse = await openai.images.generate({
          model: "dall-e-3",
          prompt: enhancedPrompt,
          n: 1,
          size: "1024x1024",
          quality: "standard",
          response_format: "url",
        });

        const imageUrl = imageResponse.data[0]?.url;

        if (!imageUrl) {
          throw new Error("No image URL returned from OpenAI");
        }

        console.log("[ghoste-ai] Image generated successfully");

        // Download the image from OpenAI
        const imageDownloadResponse = await fetch(imageUrl);
        if (!imageDownloadResponse.ok) {
          throw new Error("Failed to download generated image");
        }

        const imageBlob = await imageDownloadResponse.blob();
        const imageBuffer = await imageBlob.arrayBuffer();

        // Generate unique filename
        const timestamp = Date.now();
        const filename = `${userId}/${timestamp}-cover-art.png`;

        // Upload to Supabase Storage (bucket name is 'cover-art' with hyphen)
        const { data: uploadData, error: uploadError } = await supabaseAdmin
          .storage
          .from("cover-art")
          .upload(filename, imageBuffer, {
            contentType: "image/png",
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          console.error("[ghoste-ai] Storage upload error:", uploadError);
          throw new Error(`Failed to upload image: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabaseAdmin
          .storage
          .from("cover-art")
          .getPublicUrl(filename);

        const publicUrl = urlData.publicUrl;

        console.log("[ghoste-ai] Image uploaded to storage:", publicUrl);

        // Log generation to ai_logs table
        try {
          await supabaseAdmin
            .from("ai_logs")
            .insert({
              user_id: userId,
              feature: "cover_art",
              prompt: enhancedPrompt,
              result: { image_url: publicUrl },
              status: "success",
            });
        } catch (logError) {
          console.error("[ghoste-ai] Failed to log generation:", logError);
          // Don't throw - generation was successful
        }

        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              image_url: publicUrl,
              original_prompt: prompt,
              enhanced_prompt: enhancedPrompt,
            },
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      } catch (imageError: any) {
        console.error("[ghoste-ai] Image generation error:", imageError);

        // Log error
        try {
          await supabaseAdmin
            .from("ai_logs")
            .insert({
              user_id: userId,
              feature: "cover_art",
              prompt: enhancedPrompt,
              result: {},
              status: "error",
              error_message: imageError.message,
            });
        } catch (logError) {
          console.error("[ghoste-ai] Failed to log error:", logError);
        }

        return new Response(
          JSON.stringify({
            ok: false,
            error: imageError.message || "Failed to generate cover art",
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
    }

    // -------------------------------------------------------------------
    // TASK: CHAT (default)
    // -------------------------------------------------------------------
    if (task === "chat" || !task) {
      console.log("[ghoste-ai] Handling chat");

      if (!Array.isArray(messages) || messages.length === 0) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "No messages provided",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      // Ensure conversation exists
      if (!conversationId) {
        const { data: conv, error: convError } = await supabaseAdmin
          .from("ghoste_conversations")
          .insert([{ user_id: userId }])
          .select()
          .single();

        if (convError || !conv) {
          console.error("[ghoste-ai] Failed to create conversation:", convError);
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Failed to create conversation",
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

        conversationId = conv.id;
      }

      const lastUserMessage = messages[messages.length - 1];

      // Store user message
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
        console.error("[ghoste-ai] Failed to store user message:", userMsgError);
      }

      // Build messages with system prompt
      const openaiMessages: any[] = [
        {
          role: "system",
          content: `You are Ghoste AI, a music industry assistant that helps artists with their career.

You ARE able to interact with the user's calendar via tools:
- When the user asks you to schedule, book, remind, or set up something (meetings, listening parties, reminders, campaign check-ins, content posts, etc.), you MUST call the "create_calendar_event" tool instead of saying you cannot schedule events.
- When the user asks about their upcoming week, schedule, or "what do I have this week", you MUST call the "get_week_schedule" tool, then summarize the results in a friendly way.

You should NEVER say "I cannot access your calendar" or "I cannot schedule events." If a tool call fails, explain the error simply and suggest they check their Google connection, but do NOT claim you lack the ability.

Be conversational, helpful, and proactive in using your tools to help artists manage their calendar and reminders.`,
        },
        ...messages.map((m) => ({
          role: m.role === "assistant" || m.role === "system" ? m.role : "user",
          content: m.content,
        })),
      ];

      // Define calendar tools
      const tools = [
        {
          type: "function" as const,
          function: {
            name: "create_calendar_event",
            description: "Create a calendar event for the user in their Ghoste calendar. Use this when the user asks to schedule, create a reminder, or set up an event.",
            parameters: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Short title for the event, e.g. 'Listening party for new single' or 'Post on TikTok'",
                },
                description: {
                  type: "string",
                  description: "Optional description with details, notes, or links",
                },
                start_at_iso: {
                  type: "string",
                  description: "ISO 8601 start datetime in UTC, e.g. '2025-12-13T22:00:00Z'",
                },
                end_at_iso: {
                  type: "string",
                  description: "ISO 8601 end datetime in UTC",
                },
                reminder_minutes_before: {
                  type: "number",
                  description: "Minutes before event to send reminder (default: 60)",
                  default: 60,
                },
                channel: {
                  type: "string",
                  enum: ["email", "sms", "both"],
                  description: "How to send the reminder (default: email)",
                  default: "email",
                },
              },
              required: ["title", "start_at_iso"],
            },
          },
        },
        {
          type: "function" as const,
          function: {
            name: "get_week_schedule",
            description: "Fetch the user's calendar events for a given week. Use this when the user asks about their schedule, upcoming week, or what's planned.",
            parameters: {
              type: "object",
              properties: {
                startIso: {
                  type: "string",
                  description: "ISO 8601 start of week in UTC",
                },
                endIso: {
                  type: "string",
                  description: "ISO 8601 end of week in UTC",
                },
              },
              required: ["startIso", "endIso"],
            },
          },
        },
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: openaiMessages,
        tools,
        tool_choice: "auto",
      });

      const choice = completion.choices[0];
      const toolCalls = choice?.message?.tool_calls ?? [];

      // Handle tool calls
      if (toolCalls.length > 0) {
        console.log("[ghoste-ai] 🔧 Processing", toolCalls.length, "tool call(s):", toolCalls.map(c => c.function.name).join(", "));

        // Add assistant message with tool calls to history
        openaiMessages.push({
          role: "assistant",
          content: choice.message.content ?? "",
          tool_calls: toolCalls,
        } as any);

        for (const call of toolCalls) {
          const { name } = call.function;
          let args: any = {};

          try {
            args =
              typeof call.function.arguments === "string"
                ? JSON.parse(call.function.arguments)
                : call.function.arguments;
          } catch {
            args = {};
          }

          if (name === "create_calendar_event") {
            try {
              const netlifyUrl = Deno.env.get("URL") || "https://ghoste.one";
              console.log("[ghoste-ai] 🗓️  Calling create_calendar_event:", args);

              const res = await fetch(
                `${netlifyUrl}/.netlify/functions/calendarCreateEvent`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    userId,
                    ...args,
                  }),
                }
              );
              const json = await res.json();
              console.log("[ghoste-ai] ✅ create_calendar_event result:", json);

              openaiMessages.push({
                role: "tool",
                tool_call_id: call.id,
                name,
                content: JSON.stringify(json),
              } as any);
            } catch (err: any) {
              console.error("[ghoste-ai] ❌ create_calendar_event error:", err);
              openaiMessages.push({
                role: "tool",
                tool_call_id: call.id,
                name,
                content: JSON.stringify({
                  ok: false,
                  error: err.message
                }),
              } as any);
            }
          }

          if (name === "get_week_schedule") {
            try {
              const netlifyUrl = Deno.env.get("URL") || "https://ghoste.one";
              console.log("[ghoste-ai] 📅 Calling get_week_schedule:", args);

              const res = await fetch(
                `${netlifyUrl}/.netlify/functions/calendarListWeek`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    userId,
                    startIso: args.startIso,
                    endIso: args.endIso,
                  }),
                }
              );
              const json = await res.json();
              console.log("[ghoste-ai] ✅ get_week_schedule result:", json.count || 0, "events");

              openaiMessages.push({
                role: "tool",
                tool_call_id: call.id,
                name,
                content: JSON.stringify(json),
              } as any);
            } catch (err: any) {
              console.error("[ghoste-ai] ❌ get_week_schedule error:", err);
              openaiMessages.push({
                role: "tool",
                tool_call_id: call.id,
                name,
                content: JSON.stringify({
                  ok: false,
                  error: err.message
                }),
              } as any);
            }
          }
        }

        // Call OpenAI again with tool results
        const finalCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.7,
          messages: openaiMessages,
        });

        const assistantMessage =
          finalCompletion.choices[0]?.message?.content ??
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
          console.error("[ghoste-ai] Failed to store assistant message:", aiMsgError);
        }

        return new Response(
          JSON.stringify({
            ok: true,
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
      }

      const assistantMessage =
        choice?.message?.content ??
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
        console.error("[ghoste-ai] Failed to store assistant message:", aiMsgError);
      }

      return new Response(
        JSON.stringify({
          ok: true,
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
    }

    // Unknown task
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Unknown task: ${task}`,
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: any) {
    console.error("[ghoste-ai] Unhandled error:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message || "Unknown error",
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
