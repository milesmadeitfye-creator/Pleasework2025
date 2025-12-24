/**
 * Netlify serverless function to generate cover art using OpenAI DALL·E
 *
 * Environment Variables Required:
 * - OPENAI_API_KEY: Your OpenAI API key
 *
 * Usage:
 * POST /.netlify/functions/generate-cover-art
 * Body: {
 *   "prompt": "trap cover art with blue neon lights",
 *   "style": "moody",
 *   "size": "1024x1024",
 *   "referenceImage": "data:image/png;base64,..." (optional)
 *   "referenceMimeType": "image/jpeg" (optional)
 *   "referenceMode": "reference" | "insert" (optional)
 * }
 *
 * Response:
 * { "images": ["https://..."] }
 *
 * Modes:
 * - "reference": Use image as style/mood inspiration only (text-based generation)
 * - "insert": Try to put the actual image into the cover (attempts image edit, falls back to text)
 */

import type { Handler } from "@netlify/functions";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ""
    };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  // Check for API key
  if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY environment variable is not set");
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Server configuration error. Please contact support."
      })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const prompt = body.prompt || "";
    const style = body.style || "";
    const size = body.size || "1024x1024";
    const referenceImage = body.referenceImage || null;
    const referenceMimeType = body.referenceMimeType || null;
    const referenceMode = body.referenceMode === "insert" ? "insert" : "reference";

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing or invalid prompt" })
      };
    }

    // Build the full prompt
    let fullPrompt = prompt;

    if (style) {
      fullPrompt += `\n\nStyle: ${style}`;
    }

    if (referenceImage && referenceMode === "reference") {
      fullPrompt += `\n\nNote: Use the uploaded image as style and mood inspiration (colors, texture, and vibe) but do NOT copy it exactly.`;
    }

    if (referenceImage && referenceMode === "insert") {
      fullPrompt += `\n\nNote: Use the uploaded image as the main subject in the cover art. Preserve the person's face and identity from the photo, and design the album cover around them.`;
    }

    const apiKey = OPENAI_API_KEY;

    // "Insert into cover" mode - attempt image edit FIRST
    const canUseEdit =
      referenceMode === "insert" &&
      referenceImage &&
      referenceMimeType &&
      referenceMimeType.startsWith("image/");

    if (canUseEdit) {
      try {
        console.log("Attempting image edit with reference image. MIME:", referenceMimeType);

        // referenceImage is a data URL: "data:image/...;base64,AAAA..."
        let base64Data = referenceImage;
        const commaIndex = referenceImage.indexOf(",");
        if (commaIndex !== -1) {
          base64Data = referenceImage.slice(commaIndex + 1);
        }

        const binary = Buffer.from(base64Data, "base64");

        const formData = new FormData();
        formData.append("model", "dall-e-2");
        formData.append("prompt", fullPrompt);
        formData.append("image", new Blob([binary]), "reference.png");
        formData.append("n", "1");
        formData.append("size", size);

        const editRes = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            // DO NOT set Content-Type manually
          },
          body: formData,
        });

        if (!editRes.ok) {
          const text = await editRes.text();
          console.error("OpenAI image edit error:", editRes.status, text);
          // We will fall back to text-only generation below
        } else {
          const data = await editRes.json();
          const images = (data.data || []).map((item: any) => item.url).filter(Boolean);

          if (images.length > 0) {
            console.log("Generated image URLs via edit mode:", images);
            return {
              statusCode: 200,
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ images }),
            };
          }
        }
      } catch (editErr) {
        console.error("Error while using image edit mode:", editErr);
        // fall through to text-only generation
      }
    }

    // Fallback / Default - text-based generation (both modes)
    console.log("Generating cover art with prompt:", fullPrompt);

    const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: fullPrompt,
        n: 1,
        size,
      }),
    });

    if (!dalleRes.ok) {
      const text = await dalleRes.text();
      console.error("OpenAI image generation error:", dalleRes.status, text);
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Failed to generate cover art. Please try again.",
        }),
      };
    }

    const data = await dalleRes.json();
    const images = (data.data || []).map((item: any) => item.url).filter(Boolean);

    console.log("Generated image URLs:", images);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ images }),
    };
  } catch (err) {
    console.error("Unexpected error in generate-cover-art:", err);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Unexpected error while generating cover art.",
      }),
    };
  }
};
