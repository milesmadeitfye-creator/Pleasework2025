// Ghoste Studio - AI Lyric Captioner (Base64 Upload)
// Final robust implementation with clear error messages
// NO multipart parsing - pure JSON base64
import type { Handler } from "@netlify/functions";
import OpenAI from "openai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "METHOD_NOT_ALLOWED",
        message: "Only POST requests are allowed.",
      }),
    };
  }

  let tmpFilePath: string | null = null;

  try {
    console.log("[GhosteStudio/TranscribeBase64] Starting transcription");

    // Check for request body
    if (!event.body) {
      console.error("[GhosteStudio/TranscribeBase64] Missing request body");
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "NO_BODY",
          message: "Missing request body.",
        }),
      };
    }

    // Parse JSON body
    let parsedBody: any;
    try {
      parsedBody = JSON.parse(event.body);
    } catch (parseErr) {
      console.error("[GhosteStudio/TranscribeBase64] Invalid JSON", parseErr);
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "INVALID_JSON",
          message: "Request body is not valid JSON.",
        }),
      };
    }

    const { fileBase64, mimeType } = parsedBody;

    // Validate fileBase64
    if (!fileBase64 || typeof fileBase64 !== "string") {
      console.error("[GhosteStudio/TranscribeBase64] Missing fileBase64");
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "NO_FILE",
          message: "Missing base64 file data.",
        }),
      };
    }

    // Check for OpenAI API key BEFORE processing
    if (!process.env.OPENAI_API_KEY) {
      console.error("[GhosteStudio/TranscribeBase64] Missing OPENAI_API_KEY");
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "MISSING_OPENAI_KEY",
          message:
            "OpenAI API key is not configured. Set OPENAI_API_KEY in environment variables.",
        }),
      };
    }

    console.log("[GhosteStudio/TranscribeBase64] Decoding base64 file");

    // Decode base64 to buffer
    const buffer = Buffer.from(fileBase64, "base64");

    console.log("[GhosteStudio/TranscribeBase64] File size:", buffer.length, "bytes");

    // Determine file extension
    const tmpDir = os.tmpdir();
    const ext =
      mimeType === "video/quicktime" || mimeType === "video/mov" ? "mov" : "mp4";
    tmpFilePath = path.join(tmpDir, `ghoste-caption-${Date.now()}.${ext}`);

    // Write buffer to temp file
    await fs.promises.writeFile(tmpFilePath, buffer);

    console.log("[GhosteStudio/TranscribeBase64] Temp file:", tmpFilePath);

    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Create file stream for OpenAI
    const fileStream = fs.createReadStream(tmpFilePath);

    console.log("[GhosteStudio/TranscribeBase64] Calling OpenAI Whisper...");

    // Call OpenAI Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: fileStream as any,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    console.log("[GhosteStudio/TranscribeBase64] Transcription complete:", {
      hasText: !!transcription.text,
      segmentCount: transcription.segments?.length || 0,
    });

    // Format segments for frontend
    const segments =
      transcription.segments?.map((seg: any) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
      })) || [];

    const result = {
      transcript: transcription.text || "",
      segments,
    };

    // Clean up temp file
    fs.promises.unlink(tmpFilePath).catch((err) => {
      console.warn("[GhosteStudio/TranscribeBase64] Cleanup failed:", err.message);
    });

    console.log("[GhosteStudio/TranscribeBase64] Success!");

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    console.error("[GhosteStudio/TranscribeBase64] ERROR:", err?.message);
    console.error("[GhosteStudio/TranscribeBase64] Stack:", err?.stack);

    // Clean up temp file on error
    if (tmpFilePath) {
      fs.promises.unlink(tmpFilePath).catch(() => {});
    }

    // Extract meaningful error message
    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      "There was a problem transcribing this video.";

    // ALWAYS return JSON
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "TRANSCRIPTION_FAILED",
        message,
      }),
    };
  }
};
