// supabase/functions/_shared/openaiClient.ts
import OpenAI from "npm:openai@4.76.0";

const apiKey =
  Deno.env.get("GHOSTE_AI_OPENAI_KEY") ??
  Deno.env.get("OPENAI_API_KEY") ??
  Deno.env.get("VITE_OPENAI_API_KEY");

if (!apiKey) {
  console.warn(
    "No OpenAI API key found. Set GHOSTE_AI_OPENAI_KEY or OPENAI_API_KEY."
  );
}

export const openai = new OpenAI({
  apiKey: apiKey || "dummy-key-for-testing",
});

export function hasOpenAIKey(): boolean {
  return !!apiKey;
}
