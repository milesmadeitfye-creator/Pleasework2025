import type { Handler } from "@netlify/functions";
import { sb, jsonHeaders } from "./_sb";
import { checkVideoStatus } from "./_shared/soraVideo";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: { ...jsonHeaders, ...CORS_HEADERS },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  console.log("[sora-video-status] Request received:", event.httpMethod);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "GET") {
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
    console.error("[sora-video-status] Auth error:", authError);
    return jsonResponse(401, { error: "UNAUTHORIZED" });
  }

  const userId = user.id;

  // Get video_id from query
  const videoId = event.queryStringParameters?.video_id;

  if (!videoId) {
    return jsonResponse(400, { error: "MISSING_VIDEO_ID" });
  }

  console.log("[sora-video-status] Checking video:", videoId);

  try {
    // Fetch video record
    const { data: video, error: fetchError } = await sb
      .from("video_generations")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !video) {
      console.error("[sora-video-status] Video not found:", fetchError);
      return jsonResponse(404, { error: "VIDEO_NOT_FOUND" });
    }

    // If already completed or failed, return current state
    if (video.status === "completed" || video.status === "failed") {
      console.log("[sora-video-status] Video already terminal:", video.status);
      return jsonResponse(200, {
        video_id: video.id,
        status: video.status,
        output_url: video.output_video_url,
        thumbnail_url: video.thumbnail_url,
        progress: video.progress,
        error_message: video.error_message,
        seconds: video.seconds,
        size: video.size,
        model: video.model,
        prompt: video.prompt,
        created_at: video.created_at,
        updated_at: video.updated_at,
      });
    }

    // Check if we have openai_job_id
    if (!video.openai_job_id) {
      console.warn("[sora-video-status] No OpenAI job ID");
      return jsonResponse(200, {
        video_id: video.id,
        status: video.status,
        message: "Video is queued but no OpenAI job ID yet",
      });
    }

    console.log("[sora-video-status] Polling OpenAI:", video.openai_job_id);

    // Check status with OpenAI
    const statusResult = await checkVideoStatus(video.openai_job_id);

    console.log("[sora-video-status] OpenAI status:", statusResult);

    // Update database
    const updates: any = {};
    let shouldUpdate = false;

    if (statusResult.status !== video.status) {
      updates.status = statusResult.status;
      shouldUpdate = true;
    }

    if (statusResult.url && statusResult.url !== video.output_video_url) {
      updates.output_video_url = statusResult.url;
      shouldUpdate = true;
    }

    if (statusResult.thumbnail_url && statusResult.thumbnail_url !== video.thumbnail_url) {
      updates.thumbnail_url = statusResult.thumbnail_url;
      shouldUpdate = true;
    }

    if (statusResult.error && statusResult.status === "error") {
      updates.status = "failed";
      updates.error_message = statusResult.error;
      shouldUpdate = true;
    }

    // Update progress estimate
    if (statusResult.status === "processing") {
      updates.progress = Math.min((video.progress || 0) + 10, 90);
      shouldUpdate = true;
    } else if (statusResult.status === "completed") {
      updates.progress = 100;
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      const { error: updateError } = await sb
        .from("video_generations")
        .update(updates)
        .eq("id", video.id);

      if (updateError) {
        console.error("[sora-video-status] Update error:", updateError);
      } else {
        console.log("[sora-video-status] Video updated");
      }
    }

    return jsonResponse(200, {
      video_id: video.id,
      status: updates.status || video.status,
      output_url: updates.output_video_url || video.output_video_url,
      thumbnail_url: updates.thumbnail_url || video.thumbnail_url,
      progress: updates.progress || video.progress,
      error_message: updates.error_message || video.error_message,
      seconds: video.seconds,
      size: video.size,
      model: video.model,
      prompt: video.prompt,
      created_at: video.created_at,
      updated_at: video.updated_at,
      debug_version: statusResult.debug_version,
    });
  } catch (err: any) {
    console.error("[sora-video-status] Error:", err);

    return jsonResponse(500, {
      error: "STATUS_CHECK_ERROR",
      message: err.message || "Failed to check video status",
    });
  }
};

export default handler;
