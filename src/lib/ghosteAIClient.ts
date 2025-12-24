import { supabase } from "./supabase";

export type GhosteAIMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

/**
 * Call Ghoste AI (now via Supabase Edge Functions)
 *
 * Migrated from Netlify to Supabase Edge Functions to reduce bundle sizes
 * and keep heavy AI dependencies (OpenAI, etc.) off Netlify.
 *
 * Uses the simplified ghoste-ai Edge Function (no task routing).
 */
export async function callGhosteAI(
  messages: GhosteAIMessage[],
  userId?: string
): Promise<string> {
  try {
    console.log('[callGhosteAI] Invoking ghoste-ai:', {
      userId: userId ? 'present' : 'missing',
      messageCount: messages.length,
    });

    const { data, error } = await supabase.functions.invoke("ghoste-ai", {
      body: {
        conversation_id: null, // No conversation tracking for simple calls
        messages,
      },
    });

    if (error) {
      console.error("[callGhosteAI] Edge Function error:", {
        name: error.name,
        message: error.message,
        context: error.context,
        status: (error as any).status,
        details: error,
      });
      throw new Error(error.message || "Ghoste AI is temporarily unavailable. Please try again later.");
    }

    if (!data) {
      console.error("[callGhosteAI] No response data from Edge Function");
      throw new Error("No response from Ghoste AI");
    }

    // Extract reply from new response format
    const reply = data.reply || "I apologize, but I couldn't generate a response.";

    console.log('[callGhosteAI] Success:', { hasReply: !!reply });
    return reply;
  } catch (err) {
    console.error("[callGhosteAI] Exception:", {
      error: err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err instanceof Error ? err : new Error("Ghoste AI could not respond. Please try again.");
  }
}
