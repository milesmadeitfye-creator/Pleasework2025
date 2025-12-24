import type { Handler, HandlerEvent } from "@netlify/functions";
import { sb, jsonHeaders } from "./_sb";

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

/**
 * Register a video job ID after external creation
 *
 * Critical: This function ensures job IDs are persisted to database
 * even if initial creation didn't capture them.
 */
export const handler: Handler = async (event: HandlerEvent) => {
  console.log("[ai-video-register-job] Request received", {
    method: event.httpMethod,
    hasBody: !!event.body,
  });

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: "METHOD_NOT_ALLOWED",
      message: "Only POST requests accepted",
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { videoId, jobId, provider = "sora" } = body;

    console.log("[ai-video-register-job] Payload", {
      videoId,
      jobId,
      provider,
    });

    // Validation
    if (!videoId || typeof videoId !== "string" || videoId.trim() === "") {
      console.error("[ai-video-register-job] Invalid videoId:", videoId);
      return jsonResponse(400, {
        ok: false,
        error: "INVALID_VIDEO_ID",
        message: "videoId must be a non-empty string",
        received: { videoId, type: typeof videoId },
      });
    }

    if (!jobId || typeof jobId !== "string" || jobId.trim() === "") {
      console.error("[ai-video-register-job] Invalid jobId:", jobId);
      return jsonResponse(400, {
        ok: false,
        error: "INVALID_JOB_ID",
        message: "jobId must be a non-empty string",
        received: { jobId, type: typeof jobId },
      });
    }

    console.log("[ai-video-register-job] Updating database", {
      videoId,
      jobId,
      provider,
    });

    // Build update payload
    const updates: any = {
      provider_job_id: jobId,
      sora_job_id: jobId,
      job_id: jobId,
      provider,
      updated_at: new Date().toISOString(),
    };

    // Update the video record
    const { data, error, count } = await sb
      .from("ai_videos")
      .update(updates)
      .eq("id", videoId)
      .select("id, status, provider_job_id, sora_job_id, job_id");

    if (error) {
      console.error("[ai-video-register-job] Database error:", error);
      return jsonResponse(500, {
        ok: false,
        error: "DATABASE_ERROR",
        message: error.message,
        details: error,
      });
    }

    // Check if any rows were updated
    if (!data || data.length === 0) {
      console.error("[ai-video-register-job] Video not found", {
        videoId,
        count,
      });

      // Try to fetch the video to see if it exists
      const { data: existingVideo } = await sb
        .from("ai_videos")
        .select("id, status, user_id")
        .eq("id", videoId)
        .single();

      return jsonResponse(404, {
        ok: false,
        error: "VIDEO_NOT_FOUND",
        message: "No video found with this ID",
        debug: {
          videoId,
          exists: !!existingVideo,
          existingVideo,
        },
      });
    }

    const updatedVideo = data[0];

    console.log("[ai-video-register-job] ✅ SUCCESS", {
      videoId: updatedVideo.id,
      status: updatedVideo.status,
      provider_job_id: updatedVideo.provider_job_id,
      sora_job_id: updatedVideo.sora_job_id,
      job_id: updatedVideo.job_id,
      updatedRows: data.length,
    });

    return jsonResponse(200, {
      ok: true,
      message: "Job ID registered successfully",
      video: {
        id: updatedVideo.id,
        status: updatedVideo.status,
        provider_job_id: updatedVideo.provider_job_id,
        sora_job_id: updatedVideo.sora_job_id,
        job_id: updatedVideo.job_id,
      },
      updatedRows: data.length,
    });

  } catch (err: any) {
    console.error("[ai-video-register-job] Fatal error:", err);

    return jsonResponse(500, {
      ok: false,
      error: "INTERNAL_ERROR",
      message: err.message || "Failed to register job ID",
      stack: err.stack,
    });
  }
};

export default handler;
