/**
 * Sora Video Sync - Fallback Mode Recovery
 *
 * When video creation enters fallback mode (DB insert failed),
 * this endpoint allows the frontend to sync the job back to the database
 * once we have the OpenAI job ID.
 */

import type { Handler } from "@netlify/functions";
import { sb, jsonHeaders } from "./_sb";
import { checkVideoStatus } from "./_shared/soraVideo";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: { ...jsonHeaders, ...CORS_HEADERS },
    body: JSON.stringify(data),
  };
}

type SyncRequest = {
  openai_job_id: string;
  prompt: string;
  model: string;
  seconds: number;
  size: string;
  title?: string;
  isPro?: boolean;
  targetSeconds?: number;
};

export const handler: Handler = async (event) => {
  console.log("[sora-sync-fallback] Request received:", event.httpMethod);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }

  // Validate auth
  const authHeader = event.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "UNAUTHORIZED" });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await sb.auth.getUser(token);

  if (authError || !user) {
    console.error("[sora-sync-fallback] Auth error:", authError);
    return jsonResponse(401, { error: "UNAUTHORIZED" });
  }

  const userId = user.id;

  // Parse body
  let body: SyncRequest;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return jsonResponse(400, { error: "INVALID_JSON" });
  }

  const { openai_job_id, prompt, model, seconds, size, title, isPro = false, targetSeconds } = body;

  if (!openai_job_id || !prompt) {
    return jsonResponse(400, { error: "MISSING_REQUIRED_FIELDS", message: "openai_job_id and prompt are required" });
  }

  console.log("[sora-sync-fallback] Syncing job:", { userId: userId.substring(0, 8) + "...", openai_job_id });

  try {
    // Check if video already exists in DB (by openai_job_id)
    const { data: existing } = await sb
      .from("video_generations")
      .select("id, status, output_video_url")
      .eq("openai_job_id", openai_job_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      console.log("[sora-sync-fallback] Video already exists:", existing.id);

      // Update status if needed
      if (existing.status !== "completed" && existing.status !== "failed") {
        const statusResult = await checkVideoStatus(openai_job_id);

        const updates: any = {};
        if (statusResult.status !== existing.status) {
          updates.status = statusResult.status;
        }
        if (statusResult.url && !existing.output_video_url) {
          updates.output_video_url = statusResult.url;
        }
        if (statusResult.thumbnail_url) {
          updates.thumbnail_url = statusResult.thumbnail_url;
        }
        if (statusResult.error && statusResult.status === "error") {
          updates.status = "failed";
          updates.error_message = statusResult.error;
        }
        if (statusResult.status === "completed") {
          updates.progress = 100;
        }

        if (Object.keys(updates).length > 0) {
          await sb
            .from("video_generations")
            .update(updates)
            .eq("id", existing.id);
        }
      }

      return jsonResponse(200, {
        success: true,
        video_id: existing.id,
        status: existing.status,
        output_url: existing.output_video_url,
        existed: true,
      });
    }

    // Check OpenAI status first
    console.log("[sora-sync-fallback] Checking OpenAI status...");
    const statusResult = await checkVideoStatus(openai_job_id);

    console.log("[sora-sync-fallback] OpenAI status:", {
      status: statusResult.status,
      hasUrl: !!statusResult.url,
    });

    // Insert new record
    const isMultiSegment = targetSeconds && targetSeconds > 12;
    const insertData: any = {
      user_id: userId,
      title: title || null,
      prompt,
      model,
      is_pro: isPro,
      seconds,
      size,
      status: statusResult.status === "completed" ? "completed" : statusResult.status === "error" ? "failed" : "queued",
      openai_job_id,
      progress: statusResult.status === "completed" ? 100 : 0,
      output_video_url: statusResult.url || null,
      thumbnail_url: statusResult.thumbnail_url || null,
      error_message: statusResult.error || null,
      stitch_status: isMultiSegment ? "running" : "single",
    };

    if (isMultiSegment) {
      insertData.target_seconds = targetSeconds;
      insertData.total_seconds = targetSeconds; // Simplified for fallback
      insertData.segments_json = [
        {
          idx: 0,
          seconds,
          status: statusResult.status,
          openai_job_id,
          url: statusResult.url || null,
          prompt_suffix: null,
        },
      ];
    }

    const { data: videoRecord, error: dbError } = await sb
      .from("video_generations")
      .insert(insertData)
      .select()
      .single();

    if (dbError) {
      console.error("[sora-sync-fallback] Insert error:", dbError);
      return jsonResponse(500, {
        error: "DB_INSERT_FAILED",
        message: dbError.message,
        debug: {
          code: dbError.code,
          hint: dbError.hint,
          details: dbError.details,
        },
      });
    }

    console.log("[sora-sync-fallback] Video synced successfully:", videoRecord.id);

    return jsonResponse(200, {
      success: true,
      video_id: videoRecord.id,
      status: videoRecord.status,
      output_url: videoRecord.output_video_url,
      existed: false,
    });
  } catch (err: any) {
    console.error("[sora-sync-fallback] Error:", err);

    return jsonResponse(500, {
      error: "SYNC_ERROR",
      message: err.message || "Failed to sync video",
    });
  }
};

export default handler;
