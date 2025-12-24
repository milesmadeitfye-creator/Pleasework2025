import type { Handler } from "@netlify/functions";
import { sb, jsonHeaders } from "./_sb";
import { createVideoJob, checkVideoStatus } from "./_shared/soraVideo";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEBUG_VERSION = "runner-v1.0.0";

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: { ...jsonHeaders, ...CORS_HEADERS },
    body: JSON.stringify(data),
  };
}

type Segment = {
  idx: number;
  seconds: number;
  status: string;
  openai_job_id: string | null;
  url: string | null;
  prompt_suffix?: string | null;
};

/**
 * Sora Video Runner - Advances multi-segment video pipeline
 *
 * Call this repeatedly to progress through segments
 */
export const handler: Handler = async (event) => {
  console.log("[sora-video-runner] Request received:", event.httpMethod);

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
    return jsonResponse(401, { error: "UNAUTHORIZED" });
  }

  const userId = user.id;

  // Parse body
  let body: { video_id: string };
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "INVALID_JSON" });
  }

  const { video_id } = body;
  if (!video_id) {
    return jsonResponse(400, { error: "MISSING_VIDEO_ID" });
  }

  console.log("[sora-video-runner] Running for video:", video_id);

  try {
    // Load video record
    const { data: video, error: videoError } = await sb
      .from("video_generations")
      .select("*")
      .eq("id", video_id)
      .eq("user_id", userId)
      .single();

    if (videoError || !video) {
      console.error("[sora-video-runner] Video not found:", videoError);
      return jsonResponse(404, { error: "VIDEO_NOT_FOUND" });
    }

    // Check if single-segment (nothing to run)
    if (video.stitch_status === "single") {
      return jsonResponse(200, {
        success: true,
        mode: "single",
        video,
        message: "Single-segment video, use status endpoint",
        debug_version: DEBUG_VERSION,
      });
    }

    // Check if already completed/failed
    if (video.stitch_status === "completed") {
      return jsonResponse(200, {
        success: true,
        mode: "multi",
        video,
        message: "All segments completed",
        debug_version: DEBUG_VERSION,
      });
    }

    if (video.stitch_status === "failed") {
      return jsonResponse(200, {
        success: true,
        mode: "multi",
        video,
        message: "Pipeline failed",
        debug_version: DEBUG_VERSION,
      });
    }

    // Process segments
    const segments: Segment[] = video.segments_json || [];
    if (segments.length === 0) {
      return jsonResponse(400, { error: "NO_SEGMENTS_FOUND" });
    }

    console.log("[sora-video-runner] Processing", segments.length, "segments");

    let hasUpdates = false;
    let allCompleted = true;
    let anyFailed = false;

    // Check and update each segment
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Check if this segment needs attention
      if (segment.status === "completed" && segment.url) {
        // Already done
        continue;
      }

      if (segment.status === "failed") {
        anyFailed = true;
        allCompleted = false;
        continue;
      }

      allCompleted = false;

      // If segment has job ID, check status
      if (segment.openai_job_id && (segment.status === "queued" || segment.status === "processing")) {
        try {
          const statusResult = await checkVideoStatus(segment.openai_job_id);

          if (statusResult.status === "completed" && statusResult.url) {
            segment.status = "completed";
            segment.url = statusResult.url;
            hasUpdates = true;
            console.log(`[sora-video-runner] Segment ${i} completed`);
          } else if (statusResult.status === "failed") {
            segment.status = "failed";
            anyFailed = true;
            hasUpdates = true;
            console.log(`[sora-video-runner] Segment ${i} failed`);
          } else if (statusResult.status === "processing") {
            segment.status = "processing";
            hasUpdates = true;
          }
        } catch (err) {
          console.error(`[sora-video-runner] Error checking segment ${i}:`, err);
          // Continue to next segment
        }
      }

      // If segment is pending and previous segments are done, start it
      if (segment.status === "pending") {
        // Check if all previous segments are completed
        const prevCompleted = segments.slice(0, i).every(s => s.status === "completed");

        if (prevCompleted) {
          try {
            console.log(`[sora-video-runner] Starting segment ${i} (${segment.seconds}s)`);

            const promptSuffix = segment.prompt_suffix || "";
            const fullPrompt = video.prompt + promptSuffix;

            const jobResult = await createVideoJob({
              prompt: fullPrompt,
              model: video.model,
              seconds: segment.seconds,
              size: video.size,
            });

            segment.openai_job_id = jobResult.id;
            segment.status = jobResult.status === "completed" ? "completed" : "queued";
            if (jobResult.url) {
              segment.url = jobResult.url;
            }
            hasUpdates = true;

            console.log(`[sora-video-runner] Segment ${i} job created:`, jobResult.id);
          } catch (err) {
            console.error(`[sora-video-runner] Error starting segment ${i}:`, err);
            segment.status = "failed";
            anyFailed = true;
            hasUpdates = true;
          }
        }
      }
    }

    // Determine final status
    let newStitchStatus = video.stitch_status;
    let newOverallStatus = video.status;
    let outputUrl = video.output_video_url;
    let thumbnailUrl = video.thumbnail_url;

    if (anyFailed) {
      newStitchStatus = "failed";
      newOverallStatus = "failed";
    } else if (allCompleted) {
      newStitchStatus = "completed";
      newOverallStatus = "completed";
      // Set synthetic playlist URL
      outputUrl = `playlist://${video_id}`;
      // Use first segment thumbnail if available
      if (segments.length > 0 && segments[0].url) {
        thumbnailUrl = segments[0].url; // Or extract thumbnail separately
      }
      console.log("[sora-video-runner] All segments completed!");
    }

    // Calculate progress
    const completedCount = segments.filter(s => s.status === "completed").length;
    const progress = Math.floor((completedCount / segments.length) * 100);

    // Update database if there were changes
    if (hasUpdates || newStitchStatus !== video.stitch_status) {
      const { error: updateError } = await sb
        .from("video_generations")
        .update({
          segments_json: segments,
          stitch_status: newStitchStatus,
          status: newOverallStatus,
          progress,
          output_video_url: outputUrl,
          thumbnail_url: thumbnailUrl,
        })
        .eq("id", video_id);

      if (updateError) {
        console.error("[sora-video-runner] Update error:", updateError);
      } else {
        console.log("[sora-video-runner] Updated video:", {
          stitch_status: newStitchStatus,
          progress,
          completedSegments: completedCount,
        });
      }
    }

    // Fetch updated record
    const { data: updatedVideo } = await sb
      .from("video_generations")
      .select("*")
      .eq("id", video_id)
      .single();

    return jsonResponse(200, {
      success: true,
      mode: "multi",
      video: updatedVideo || video,
      segments,
      progress,
      completedSegments: completedCount,
      totalSegments: segments.length,
      stitch_status: newStitchStatus,
      debug_version: DEBUG_VERSION,
    });
  } catch (err: any) {
    console.error("[sora-video-runner] Error:", err);
    return jsonResponse(500, {
      error: "RUNNER_ERROR",
      message: err.message || "Runner failed",
      debug_version: DEBUG_VERSION,
    });
  }
};

export default handler;
