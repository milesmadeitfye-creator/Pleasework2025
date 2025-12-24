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

/**
 * Map Sora status to our internal status
 */
function mapSoraStatus(soraStatus: string): string {
  const status = soraStatus.toLowerCase();

  if (status === "queued" || status === "pending") return "queued";
  if (status === "running" || status === "processing") return "processing";
  if (status === "completed" || status === "succeeded") return "completed";
  if (status === "failed" || status === "error") return "failed";

  // Default to processing for unknown statuses
  return "processing";
}

export const handler: Handler = async (event) => {
  console.log("[sora-poll-jobs] Request received:", event.httpMethod);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  // Validate auth
  const authHeader = event.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, { ok: false, error: "UNAUTHORIZED", message: "Missing authorization" });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await sb.auth.getUser(token);

  if (authError || !user) {
    console.error("[sora-poll-jobs] Auth error:", authError);
    return jsonResponse(401, { ok: false, error: "UNAUTHORIZED", message: "Invalid token" });
  }

  const userId = user.id;

  // Parse body
  let body: { video_id?: string; job_id?: string };
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return jsonResponse(400, { ok: false, error: "INVALID_JSON", message: "Request body must be valid JSON" });
  }

  const { video_id, job_id } = body;

  if (!video_id && !job_id) {
    return jsonResponse(400, { ok: false, error: "MISSING_PARAMETER", message: "Either video_id or job_id is required" });
  }

  try {
    // Fetch the video record
    let query = sb
      .from("ai_videos")
      .select("*")
      .eq("user_id", userId);

    if (video_id) {
      query = query.eq("id", video_id);
    } else if (job_id) {
      query = query.eq("job_id", job_id);
    }

    const { data: video, error: fetchError } = await query.maybeSingle();

    if (fetchError) {
      console.error("[sora-poll-jobs] Fetch error:", fetchError);
      return jsonResponse(500, { ok: false, error: "FETCH_FAILED", message: fetchError.message });
    }

    if (!video) {
      return jsonResponse(404, { ok: false, error: "NOT_FOUND", message: "Video not found" });
    }

    // Check for job_id in multiple columns for robustness
    const effectiveJobId = video.job_id || video.provider_job_id || video.sora_job_id;

    if (!effectiveJobId) {
      console.error("[sora-poll-jobs] No job ID found in any column:", {
        video_id: video.id,
        job_id: video.job_id,
        provider_job_id: video.provider_job_id,
        sora_job_id: video.sora_job_id,
      });
      return jsonResponse(400, {
        ok: false,
        error: "NO_JOB_ID",
        message: "Video has no job_id in any column (job_id, provider_job_id, sora_job_id)"
      });
    }

    console.log("[sora-poll-jobs] Polling video:", video.id, "job:", effectiveJobId, {
      source: video.job_id ? 'job_id' : video.provider_job_id ? 'provider_job_id' : 'sora_job_id',
    });

    // Check status with Sora
    const statusResult = await checkVideoStatus(effectiveJobId);

    console.log("[sora-poll-jobs] Sora status:", {
      videoId: video.id,
      jobId: effectiveJobId,
      status: statusResult.status,
      hasUrl: !!statusResult.url,
      hasError: !!statusResult.error,
    });

    // Map status
    const mappedStatus = mapSoraStatus(statusResult.status);

    // Build updates
    const updates: any = {
      status: mappedStatus,
    };

    // Handle completion
    if (mappedStatus === "completed" && statusResult.url) {
      updates.video_url = statusResult.url;
      updates.completed_at = new Date().toISOString();

      if (statusResult.thumbnail_url) {
        updates.thumbnail_url = statusResult.thumbnail_url;
      }

      console.log("[sora-poll-jobs] Video completed:", video.id);
    }

    // Handle failure - ONLY if provider explicitly reports failed/error
    if (mappedStatus === "failed") {
      updates.error = statusResult.error || "Video generation failed";
      console.log("[sora-poll-jobs] Video failed:", video.id, updates.error);
    }

    // Update the record
    const { error: updateError } = await sb
      .from("ai_videos")
      .update(updates)
      .eq("id", video.id);

    if (updateError) {
      console.error("[sora-poll-jobs] Update error:", updateError);
      return jsonResponse(500, { ok: false, error: "UPDATE_FAILED", message: updateError.message });
    }

    console.log("[sora-poll-jobs] Updated video:", video.id, updates);

    // Return response
    return jsonResponse(200, {
      ok: true,
      status: mappedStatus,
      video_url: updates.video_url || null,
      thumbnail_url: updates.thumbnail_url || null,
      error: updates.error || null,
    });
  } catch (err: any) {
    console.error("[sora-poll-jobs] Error:", err);

    return jsonResponse(500, {
      ok: false,
      error: "POLL_ERROR",
      message: err.message || "Failed to poll job",
    });
  }
};

export default handler;
