// src/lib/ghosteAI/edgeClient.ts
//
// callGhosteAI is the ONLY way the frontend should call Ghoste AI.
// New AI features = new `task` values + payload shapes, but still go through this helper.
//
// This ensures:
// - No OpenAI keys in frontend code
// - All AI logic runs in Supabase Edge Functions
// - Consistent error handling and logging
//
import { supabase } from "../supabase";

type GhosteAITask =
  | "chat"
  | "chat_persistent"
  | "email_draft"
  | "calendar_suggestion"
  | "smart_link_copy"
  | "ad_copy"
  | "generic";

interface CallGhosteAIArgs {
  userId?: string;
  task: GhosteAITask;
  payload: Record<string, unknown>;
}

interface GhosteAIResponse<TResult = unknown> {
  ok: boolean;
  task: GhosteAITask;
  result: TResult;
  error?: string;
  details?: string;
}

/**
 * Call Ghoste AI via Supabase Edge Functions
 *
 * Replaces Netlify AI functions with lightweight Supabase Edge Function calls.
 * All heavy AI logic (OpenAI, langchain, etc.) runs in Supabase Edge Functions,
 * keeping Netlify bundles small.
 *
 * @example
 * // Chat
 * const { result } = await callGhosteAI({
 *   userId: user.id,
 *   task: "chat",
 *   payload: { messages: [{ role: "user", content: "Hello!" }] }
 * });
 *
 * // Email draft
 * const { result } = await callGhosteAI({
 *   userId: user.id,
 *   task: "email_draft",
 *   payload: { subject: "New Release", context: "Announcing my new album" }
 * });
 */
export async function callGhosteAI<TResult = unknown>(
  args: CallGhosteAIArgs
): Promise<GhosteAIResponse<TResult>> {
  const { userId, task, payload } = args;

  try {
    console.log('[callGhosteAI] Invoking Edge Function:', {
      task,
      userId: userId ? 'present' : 'missing',
      payloadKeys: Object.keys(payload),
    });

    const { data, error } = await supabase.functions.invoke("ghoste-ai", {
      body: {
        user_id: userId,
        task,
        payload,
      },
    });

    if (error) {
      console.error('[callGhosteAI] Edge Function error:', {
        name: error.name,
        message: error.message,
        context: error.context,
        status: (error as any).status,
        details: error,
      });
      throw new Error(error.message || "Ghoste AI request failed");
    }

    if (!data) {
      console.error('[callGhosteAI] No response data from Edge Function');
      throw new Error("No response from Ghoste AI");
    }

    console.log('[callGhosteAI] Success:', { task, hasResult: !!data.result });
    return data as GhosteAIResponse<TResult>;
  } catch (err) {
    console.error('[callGhosteAI] Exception:', {
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Chat with Ghoste AI
 * Uses the new ghosteAgent Netlify function with tool orchestration capabilities
 */
export async function ghosteChat(args: {
  userId: string;
  conversationId?: string | null;
  clientMessageId?: string;
  messages: Array<{ role: string; content: string }>;
  task?: string;
  meta?: Record<string, any>;
}): Promise<{ conversation_id: string; message: string; actions?: any }> {
  try {
    console.log('[ghosteChat] Calling Netlify ghosteAgent function:', {
      userId: args.userId ? 'present' : 'missing',
      conversationId: args.conversationId || 'new',
      clientMessageId: args.clientMessageId || 'generated',
      messageCount: args.messages.length,
    });

    const response = await fetch("/.netlify/functions/ghosteAgent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: args.userId,
        conversationId: args.conversationId || null,
        clientMessageId: args.clientMessageId,
        messages: args.messages,
        context: {
          conversationId: args.conversationId || null,
          task: args.task || "chat",
          meta: args.meta || null,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[ghosteChat] Netlify function error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new Error(`Failed to contact Ghoste AI: ${response.status} ${response.statusText}`);
    }

    const data: {
      ok: boolean;
      message: {
        role: string;
        content: string;
      };
      conversation_id?: string;
      ai_unavailable?: boolean;
    } = await response.json();

    if (!data || !data.ok) {
      console.error('[ghosteChat] Invalid response data:', data);
      throw new Error("Invalid response from Ghoste AI");
    }

    // Handle AI unavailability gracefully
    if (!data.message || !data.message.content) {
      console.error('[ghosteChat] No message in response, using fallback');
      return {
        conversation_id: data.conversation_id || args.conversationId || crypto.randomUUID(),
        message: 'Ghoste AI is temporarily unavailable. Your message has been saved. Please try again shortly.',
        actions: undefined,
        ai_unavailable: true,
      };
    }

    console.log('[ghosteChat] Success:', {
      conversationId: data.conversation_id || args.conversationId || 'new',
      hasReply: !!data.message.content,
      aiUnavailable: !!data.ai_unavailable,
    });

    return {
      conversation_id: data.conversation_id || args.conversationId || crypto.randomUUID(),
      message: data.message.content,
      actions: undefined,
      ai_unavailable: data.ai_unavailable,
    };
  } catch (err) {
    console.error('[ghosteChat] Exception:', {
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Generate email draft
 */
export async function ghosteEmailDraft(args: {
  userId?: string;
  subject: string;
  context: string;
  tone?: string;
}): Promise<{ subject: string; body: string }> {
  const response = await callGhosteAI<{ subject: string; body: string }>({
    userId: args.userId,
    task: "email_draft",
    payload: {
      subject: args.subject,
      context: args.context,
      tone: args.tone || "professional",
    },
  });

  return response.result;
}

/**
 * Get calendar suggestions
 */
export async function ghosteCalendarSuggestion(args: {
  userId?: string;
  description: string;
}): Promise<{ suggestion: string }> {
  const response = await callGhosteAI<{ suggestion: string }>({
    userId: args.userId,
    task: "calendar_suggestion",
    payload: {
      description: args.description,
    },
  });

  return response.result;
}

/**
 * Generate smart link copy
 */
export async function ghosteSmartLinkCopy(args: {
  userId?: string;
  trackTitle: string;
  artistName: string;
}): Promise<{ caption: string }> {
  const response = await callGhosteAI<{ caption: string }>({
    userId: args.userId,
    task: "smart_link_copy",
    payload: {
      track_title: args.trackTitle,
      artist_name: args.artistName,
    },
  });

  return response.result;
}

/**
 * Generate ad copy
 */
export async function ghosteAdCopy(args: {
  userId?: string;
  trackTitle: string;
  artistName: string;
  platform?: string;
  goal?: string;
}): Promise<{ copy: string }> {
  const response = await callGhosteAI<{ copy: string }>({
    userId: args.userId,
    task: "ad_copy",
    payload: {
      track_title: args.trackTitle,
      artist_name: args.artistName,
      platform: args.platform || "Meta",
      goal: args.goal || "streams",
    },
  });

  return response.result;
}

/**
 * DEPRECATED: Use Netlify function /.netlify/functions/generate-cover-art instead
 *
 * Generate cover art prompt
 */
// export async function ghosteCoverArtPrompt(args: {
//   userId?: string;
//   trackTitle: string;
//   artistName: string;
//   style?: string;
//   mood?: string;
//   references?: string;
//   prompt?: string;
// }): Promise<{ prompt: string }> {
//   const response = await callGhosteAI<{ prompt: string }>({
//     userId: args.userId,
//     task: "cover_art_prompt",
//     payload: {
//       track_title: args.trackTitle,
//       artist_name: args.artistName,
//       style: args.style || "",
//       mood: args.mood || "",
//       references: args.references || "",
//       prompt: args.prompt || "",
//     },
//   });
//
//   return response.result;
// }

/**
 * DEPRECATED: Use Netlify function /.netlify/functions/generate-cover-art instead
 *
 * Generate cover art image
 */
// export async function ghosteCoverArtImage(args: {
//   userId?: string;
//   prompt: string;
//   style?: string;
// }): Promise<{ image_url: string; enhanced_prompt: string }> {
//   const response = await callGhosteAI<{ image_url: string; enhanced_prompt: string }>({
//     userId: args.userId,
//     task: "cover_art_image",
//     payload: {
//       prompt: args.prompt,
//       style: args.style || "moody",
//     },
//   });
//
//   return response.result;
// }

/**
 * Chat with persistent conversation history
 * Saves messages to database and returns conversation_id for follow-up messages
 */
export async function ghosteChatPersistent(args: {
  userId: string;
  conversationId?: string | null;
  messages: Array<{ role: string; content: string }>;
}): Promise<{ conversation_id: string; messages: Array<{ role: string; content: string }> }> {
  try {
    console.log('[ghosteChatPersistent] Invoking Edge Function:', {
      userId: args.userId ? 'present' : 'missing',
      conversationId: args.conversationId || 'new',
      messageCount: args.messages.length,
    });

    const { data, error } = await supabase.functions.invoke("ghoste-ai", {
      body: {
        user_id: args.userId,
        task: "chat_persistent",
        conversation_id: args.conversationId,
        messages: args.messages,
        payload: {}, // Empty payload for this task
      },
    });

    if (error) {
      console.error('[ghosteChatPersistent] Edge Function error:', {
        name: error.name,
        message: error.message,
        context: error.context,
        status: (error as any).status,
        details: error,
      });
      throw new Error(error.message || "Ghoste AI request failed");
    }

    if (!data || !data.ok) {
      console.error('[ghosteChatPersistent] No response data from Edge Function');
      throw new Error(data?.error || "No response from Ghoste AI");
    }

    console.log('[ghosteChatPersistent] Success:', {
      conversationId: data.result.conversation_id,
      messageCount: data.result.messages.length,
    });

    return data.result;
  } catch (err) {
    console.error('[ghosteChatPersistent] Exception:', {
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err instanceof Error ? err : new Error(String(err));
  }
}
