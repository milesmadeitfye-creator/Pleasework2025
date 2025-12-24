// Ghoste Studio - AI Lyric Captioner (Direct Upload)
// Accepts multipart form-data video upload
// Transcribes using OpenAI Whisper
// ALWAYS returns JSON (never HTML error pages)
import type { Handler } from "@netlify/functions";
import OpenAI from "openai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import multiparty from "multiparty";

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
        message: "Only POST requests are allowed."
      }),
    };
  }

  let tmpFilePath: string | null = null;

  // WRAP EVERYTHING in try/catch to ALWAYS return JSON
  try {
    console.log("[GhosteStudio/TranscribeUpload] Starting transcription request");

    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error("[GhosteStudio/TranscribeUpload] Missing OPENAI_API_KEY");
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "MISSING_OPENAI_KEY",
          message: "OpenAI is not configured. Please contact support.",
        }),
      };
    }

    // Check content-type
    const contentType = event.headers["content-type"] || event.headers["Content-Type"];
    if (!contentType) {
      console.error("[GhosteStudio/TranscribeUpload] Missing content-type header");
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "NO_CONTENT_TYPE",
          message: "Missing content-type header.",
        }),
      };
    }

    console.log("[GhosteStudio/TranscribeUpload] Parsing multipart data");

    // Parse multipart form data
    const form = new multiparty.Form();
    const bodyBuffer = Buffer.from(
      event.body || "",
      event.isBase64Encoded ? "base64" : "utf8"
    );

    // Parse the form data
    const parsedData = await new Promise<{ files: any; fields: any }>((resolve, reject) => {
      const req: any = {
        headers: { "content-type": contentType },
        on: (eventName: string, callback: Function) => {
          if (eventName === "data") {
            callback(bodyBuffer);
          } else if (eventName === "end") {
            callback();
          }
        },
        pause: () => {},
        resume: () => {},
      };

      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err);
        } else {
          resolve({ files, fields });
        }
      });
    });

    // Get uploaded file
    const uploadedFiles = parsedData.files.file || parsedData.files.video;
    if (!uploadedFiles || uploadedFiles.length === 0) {
      console.error("[GhosteStudio/TranscribeUpload] No file field found in upload");
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "NO_FILE",
          message: "No video file provided.",
        }),
      };
    }

    const uploadedFile = uploadedFiles[0];
    tmpFilePath = uploadedFile.path;

    console.log("[GhosteStudio/TranscribeUpload] File received:", {
      path: tmpFilePath,
      size: uploadedFile.size,
    });

    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Create file stream for OpenAI
    const fileStream = fs.createReadStream(tmpFilePath);

    console.log("[GhosteStudio/TranscribeUpload] Calling OpenAI Whisper API...");

    // Call OpenAI Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: fileStream as any,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    console.log("[GhosteStudio/TranscribeUpload] Transcription complete:", {
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

    // Clean up temp file (best-effort)
    if (tmpFilePath) {
      fs.promises.unlink(tmpFilePath).catch((err) => {
        console.warn("[GhosteStudio/TranscribeUpload] Failed to delete temp file:", err.message);
      });
    }

    console.log("[GhosteStudio/TranscribeUpload] Success!");

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    // ALWAYS log and return JSON, never let unhandled errors create HTML pages
    console.error("[GhosteStudio/TranscribeUpload] ERROR:", err?.message);
    console.error("[GhosteStudio/TranscribeUpload] Stack:", err?.stack);

    // Clean up temp file on error
    if (tmpFilePath) {
      fs.promises.unlink(tmpFilePath).catch(() => {
        /* ignore cleanup errors */
      });
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
