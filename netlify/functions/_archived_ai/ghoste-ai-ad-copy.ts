import type { Handler } from "@netlify/functions";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Verify auth
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid token" }),
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || "{}");
    const {
      goal,
      offer,
      target_audience,
      tone,
      link_url,
      artist_name,
      song_title,
    } = body;

    if (!goal || !offer) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing required fields: goal, offer" }),
      };
    }

    // Initialize OpenAI
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error("[ghoste-ai-ad-copy] OPENAI_API_KEY not configured");
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "OpenAI not configured" }),
      };
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Build prompt
    const prompt = `You are an expert Meta ads copywriter for independent musicians.

Generate high-converting ad copy for a Meta/Facebook ad campaign with these details:

Goal: ${goal}
Offer: ${offer}
Target Audience: ${target_audience || "music fans"}
Tone: ${tone || "energetic and authentic"}
${artist_name ? `Artist: ${artist_name}` : ""}
${song_title ? `Song: ${song_title}` : ""}
${link_url ? `Link: ${link_url}` : ""}

Requirements:
- Primary Text: 1-2 sentences that grab attention and communicate the offer clearly (max 125 characters)
- Headline: Short, punchy headline (max 40 characters)
- Description: Brief supporting text (max 30 characters)
- Suggested CTA: One of these: LEARN_MORE, LISTEN_NOW, SIGN_UP, DOWNLOAD, WATCH_MORE, SHOP_NOW

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "primary_text": "...",
  "headline": "...",
  "description": "...",
  "suggested_cta": "LEARN_MORE"
}`;

    console.log("[ghoste-ai-ad-copy] Generating ad copy for user:", user.id.substring(0, 8));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert Meta ads copywriter. Always respond with valid JSON only, no markdown formatting.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 300,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || "";

    if (!responseText) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse JSON response
    let adCopy: any;
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      adCopy = JSON.parse(cleanedResponse);
    } catch (parseErr) {
      console.error("[ghoste-ai-ad-copy] Failed to parse JSON:", responseText);
      throw new Error("Failed to parse AI response as JSON");
    }

    // Validate response structure
    if (!adCopy.primary_text || !adCopy.headline) {
      throw new Error("Invalid ad copy structure from AI");
    }

    console.log("[ghoste-ai-ad-copy] Generated ad copy successfully");

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        ad_copy: {
          primary_text: adCopy.primary_text || "",
          headline: adCopy.headline || "",
          description: adCopy.description || "",
          suggested_cta: adCopy.suggested_cta || "LEARN_MORE",
        },
      }),
    };
  } catch (error: any) {
    console.error("[ghoste-ai-ad-copy] Error:", error);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to generate ad copy",
        message: error.message || "Unknown error",
      }),
    };
  }
};
