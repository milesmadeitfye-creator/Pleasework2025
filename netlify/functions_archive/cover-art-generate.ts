/**
 * UNUSED - This file is kept for backup only
 * The main function is now at: /netlify/functions/generate-cover-art.ts
 */

import type { Handler } from "@netlify/functions";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const json = (s: number, b: any) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(b)
});

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const { prompt, style, user_id } = JSON.parse(event.body || "{}");
    if (!prompt) return json(400, { error: "Missing prompt" });

    const stylePrompt = style ? `${style} style, ` : "";
    const fullPrompt = `${stylePrompt}album cover art: ${prompt}. High quality, professional music cover design.`;

    console.log("Generating cover art with prompt:", fullPrompt);

    const completion = await client.images.generate({
      model: "dall-e-3",
      prompt: fullPrompt,
      size: "1024x1024",
      quality: "hd",
      n: 1,
      response_format: "url"
    });

    const imageUrl = completion.data?.[0]?.url;
    if (!imageUrl) {
      throw new Error("No image returned from DALL-E 3. Check OpenAI credits or try a different prompt.");
    }

    console.log("Image generated successfully:", imageUrl);

    if (user_id) {
      try {
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const timestamp = Date.now();
        const key = `u_${user_id}/${timestamp}.png`;

        const { error: upErr } = await supa.storage
          .from("cover-art")
          .upload(key, imageBuffer, {
            contentType: "image/png",
            upsert: true,
            cacheControl: "3600"
          });

        if (!upErr) {
          const { data: pub } = supa.storage.from("cover-art").getPublicUrl(key);
          return json(200, {
            imageUrl: pub.publicUrl,
            images: [pub.publicUrl]
          });
        }
      } catch (storageErr) {
        console.error("Storage error (returning OpenAI URL):", storageErr);
      }
    }

    return json(200, {
      imageUrl,
      images: [imageUrl]
    });
  } catch (e: any) {
    console.error("Cover art generation error:", e);
    const msg = e?.message || "AI generation error";
    const hint = /insufficient_quota|credit/i.test(msg)
      ? "Your OpenAI account is out of credits. Please add credits to continue."
      : /Forbidden|401/i.test(msg)
      ? "OpenAI API key is invalid or not configured."
      : /content_policy/i.test(msg)
      ? "Your prompt was flagged by OpenAI's content policy. Please try a different description."
      : "Generation failed. Please try a simpler prompt or try again.";
    return json(500, { error: `${msg} ${hint}` });
  }
};
