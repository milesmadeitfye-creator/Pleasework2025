/**
 * Netlify Function: Cover Art Generator
 *
 * Server-side image generation + upload to avoid CORS/CSP issues
 * - Generates via OpenAI DALL-E 3
 * - Uploads to Supabase Storage (server-side with service role)
 * - Returns public URL for immediate display
 * - Dev override for milesdorre5@gmail.com (no credit deduction)
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    // Check required environment variables
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const BUCKET = process.env.SUPABASE_COVER_BUCKET || "artist-assets";

    if (!OPENAI_API_KEY) {
      console.error("[generate-cover-art] Missing OPENAI_API_KEY");
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "missing_env",
          key: "OPENAI_API_KEY",
          message: "OpenAI API key not configured in Netlify environment variables"
        })
      };
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[generate-cover-art] Missing Supabase credentials");
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "missing_env",
          key: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
          message: "Supabase credentials not configured in Netlify environment variables"
        })
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || "{}");
    const {
      userId,
      prompt,
      style,
      size = "1024x1024"
    } = body;

    console.log(`[generate-cover-art] Request: userId=${userId}, size=${size}`);

    // Validate inputs
    if (!prompt || !prompt.trim()) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "prompt is required" })
      };
    }

    // Initialize Supabase with service role (server-side)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Check dev override (skip credit checks for test accounts)
    const DEV_OVERRIDE_EMAILS = [
      'milesdorre5@gmail.com',
      ...(process.env.VITE_DEV_OVERRIDE_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
    ];

    let isDevOverride = false;
    let userEmail = '';

    if (userId) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("email")
        .eq("id", userId)
        .maybeSingle();

      userEmail = profile?.email?.toLowerCase() || '';
      isDevOverride = DEV_OVERRIDE_EMAILS.includes(userEmail);

      console.log(`[generate-cover-art] User: ${userEmail}, Dev Override: ${isDevOverride}`);
    }

    // Check credits (skip for dev override)
    const COST = 300;
    if (userId && !isDevOverride) {
      const { data: wallet } = await supabase
        .from("user_wallets")
        .select("tools_budget_balance")
        .eq("user_id", userId)
        .maybeSingle();

      const balance = wallet?.tools_budget_balance || 0;

      if (balance < COST) {
        return {
          statusCode: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "INSUFFICIENT_CREDITS",
            message: `You need ${COST} Tools credits, but only have ${balance}.`,
            required: COST,
            current: balance
          })
        };
      }
    }

    // Build final prompt
    const styleSnippet = style ? ` in a ${style} style` : "";
    const finalPrompt = `${prompt.trim()}${styleSnippet}. High-end album cover art. Clean composition with space for title typography. Professional music industry quality.`;

    console.log(`[generate-cover-art] Generating with prompt: ${finalPrompt.substring(0, 100)}...`);

    // Generate image via OpenAI DALL-E 3
    const dalleResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size: size,
        response_format: "b64_json"
      })
    });

    if (!dalleResponse.ok) {
      const errorText = await dalleResponse.text();
      console.error("[generate-cover-art] OpenAI error:", dalleResponse.status, errorText);
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "image_generation_failed",
          message: "OpenAI API returned an error",
          details: errorText
        })
      };
    }

    const dalleData = await dalleResponse.json();
    const imageBase64 = dalleData.data?.[0]?.b64_json;

    if (!imageBase64) {
      console.error("[generate-cover-art] No image data returned");
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "no_image_returned",
          message: "OpenAI did not return image data"
        })
      };
    }

    // Upload to Supabase Storage (server-side with service role)
    const buffer = Buffer.from(imageBase64, "base64");
    const safeUserId = userId ? userId.replace(/[^a-zA-Z0-9_-]/g, "") : "anon";
    const fileName = `cover-art/${safeUserId}/${Date.now()}.png`;

    console.log(`[generate-cover-art] Uploading to bucket: ${BUCKET}, path: ${fileName}`);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, {
        contentType: "image/png",
        upsert: true
      });

    if (uploadError) {
      console.error("[generate-cover-art] Upload error:", uploadError);
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "storage_upload_failed",
          message: "Failed to upload image to storage",
          details: uploadError
        })
      };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(fileName);

    console.log(`[generate-cover-art] Image uploaded: ${publicUrl}`);

    // Save to history (if user provided)
    if (userId) {
      const { error: insertError } = await supabase
        .from("cover_art_images")
        .insert({
          user_id: userId,
          prompt: prompt.trim(),
          style: style || null,
          image_url: publicUrl,
          size: size,
          variant: "standard"
        });

      if (insertError) {
        console.error("[generate-cover-art] History insert error:", insertError);
        // Don't fail the request, just log it
      }
    }

    // Deduct credits (skip for dev override)
    let newBalance = 0;

    if (userId && !isDevOverride) {
      const { data: wallet } = await supabase
        .from("user_wallets")
        .select("tools_budget_balance")
        .eq("user_id", userId)
        .maybeSingle();

      const currentBalance = wallet?.tools_budget_balance || 0;
      newBalance = currentBalance - COST;

      await supabase
        .from("user_wallets")
        .update({ tools_budget_balance: newBalance, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      await supabase
        .from("wallet_transactions")
        .insert({
          user_id: userId,
          budget_type: "TOOLS",
          credit_change: -COST,
          action_type: "CONSUMPTION",
          reference_feature: "cover_art_generation"
        });

      console.log(`[generate-cover-art] Credits deducted. New balance: ${newBalance}`);
    } else if (isDevOverride) {
      console.log(`[generate-cover-art] Dev override - credits not deducted`);
      const { data: wallet } = await supabase
        .from("user_wallets")
        .select("tools_budget_balance")
        .eq("user_id", userId)
        .maybeSingle();
      newBalance = wallet?.tools_budget_balance || 0;
    }

    // Return success
    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket: BUCKET,
        path: fileName,
        publicUrl: publicUrl,
        remainingCredits: newBalance,
        cost: isDevOverride ? 0 : COST
      })
    };

  } catch (err: any) {
    console.error("[generate-cover-art] Unexpected error:", err);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "server_error",
        message: err.message || "An unexpected error occurred"
      })
    };
  }
};
