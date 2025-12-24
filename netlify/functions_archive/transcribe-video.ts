// Requires: OPENAI_API_KEY
// Ghoste Studio AI Lyric Captioner - Transcription Service
// Accepts a Supabase file URL, transcribes audio using OpenAI Whisper
// Returns transcript with segment timestamps for captioning
import type { Handler } from "@netlify/functions";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" }),
    };
  }

  let tmpFilePath: string | null = null;

  try {
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error("[GhosteStudio/TranscribeVideo] Missing OPENAI_API_KEY");
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "MISSING_OPENAI_KEY",
          message: "OpenAI is not configured. Please contact support.",
        }),
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || "{}");
    const fileUrl = body.fileUrl as string | undefined;
    const language = body.language as string | undefined;

    if (!fileUrl) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "MISSING_FILE_URL",
          message: "No video file URL provided.",
        }),
      };
    }

    console.log("[GhosteStudio/TranscribeVideo] Starting transcription", {
      fileUrl: fileUrl.substring(0, 80) + "...",
      language: language || "auto",
    });

    // Download file from Supabase URL
    console.log("[GhosteStudio/TranscribeVideo] Fetching file from URL...");
    const res = await fetch(fileUrl);
    if (!res.ok) {
      console.error(
        "[GhosteStudio/TranscribeVideo] Failed to download file",
        res.status,
        res.statusText
      );
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "DOWNLOAD_FAILED",
          message: "Could not download the video file from storage.",
        }),
      };
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Write to temp file
    const tmpDir = os.tmpdir();
    tmpFilePath = path.join(tmpDir, `ghoste-transcribe-${Date.now()}.mp4`);
    await fs.promises.writeFile(tmpFilePath, buffer);

    console.log("[GhosteStudio/TranscribeVideo] Saved temp file", {
      path: tmpFilePath,
      size: buffer.length,
    });

    // Create file stream for OpenAI
    const fileStream = fs.createReadStream(tmpFilePath);

    // Call OpenAI Whisper API
    console.log("[GhosteStudio/TranscribeVideo] Calling OpenAI Whisper API...");
    const transcription = await openai.audio.transcriptions.create({
      file: fileStream as any,
      model: "whisper-1",
      language: language && language !== "auto" ? language : undefined,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    console.log("[GhosteStudio/TranscribeVideo] Transcription complete", {
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
        console.warn(
          "[GhosteStudio/TranscribeVideo] Failed to delete temp file",
          err.message
        );
      });
    }

    console.log("[GhosteStudio/TranscribeVideo] Success!");

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    console.error("[GhosteStudio/TranscribeVideo] ERROR", err);
    console.error("[GhosteStudio/TranscribeVideo] Error stack:", err.stack);

    // Clean up temp file on error
    if (tmpFilePath) {
      fs.promises.unlink(tmpFilePath).catch(() => {
        /* ignore */
      });
    }

    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      "There was a problem transcribing this video. Please try again.";

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "TRANSCRIPTION_FAILED",
        message,
      }),
    };
  }
};
