import type { Handler, HandlerEvent } from "@netlify/functions";
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

  if (status === "queued" || status === "pending" || status === "starting") return "processing";
  if (status === "running" || status === "processing") return "processing";
  if (status === "completed" || status === "succeeded") return "completed";
  if (status === "failed" || status === "canceled" || status === "error") return "failed";

  // Default to processing for unknown statuses
  return "processing";
}

/**
 * Scheduled function handler (runs every minute via Netlify)
 * Also supports manual invocation via HTTP for testing
 */
export const handler: Handler = async (event: HandlerEvent) => {
  const isScheduled = event.httpMethod === undefined || event.httpMethod === "GET";
  const startTime = Date.now();

  console.log("[ai-video-poll] Starting scheduled poll", {
    isScheduled,
    timestamp: new Date().toISOString(),
  });

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    // Query all videos that need polling
    const { data: videos, error: fetchError } = await sb
      .from("ai_videos")
      .select("*")
      .eq("provider", "sora")
      .in("status", ["queued", "processing"])
      .not("sora_job_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(50); // Poll max 50 videos per run to avoid timeouts

    if (fetchError) {
      console.error("[ai-video-poll] Fetch error:", fetchError);
      return jsonResponse(500, {
        ok: false,
        error: "FETCH_FAILED",
        message: fetchError.message,
      });
    }

    if (!videos || videos.length === 0) {
      console.log("[ai-video-poll] No videos to poll");
      return jsonResponse(200, {
        ok: true,
        message: "No videos to poll",
        polled: 0,
        duration_ms: Date.now() - startTime,
      });
    }

    console.log(`[ai-video-poll] Found ${videos.length} videos to poll`);

    const results = {
      total: videos.length,
      updated: 0,
      completed: 0,
      failed: 0,
      still_processing: 0,
      errors: [] as string[],
    };

    // Poll each video
    for (const video of videos) {
      try {
        const jobId = video.sora_job_id || video.provider_job_id || video.job_id;

        if (!jobId) {
          console.error(`[ai-video-poll] Video ${video.id} has no job_id`);
          results.errors.push(`${video.id}: no job_id`);
          continue;
        }

        console.log(`[ai-video-poll] Polling video ${video.id} job ${jobId}`);

        // Check status with Sora
        const statusResult = await checkVideoStatus(jobId);

        console.log(`[ai-video-poll] Sora response for ${video.id}:`, {
          status: statusResult.status,
          hasUrl: !!statusResult.url,
          hasError: !!statusResult.error,
        });

        // Map status
        const mappedStatus = mapSoraStatus(statusResult.status);

        // Build updates
        const updates: any = {
          status: mappedStatus,
          updated_at: new Date().toISOString(),
        };

        // Handle completion
        if (mappedStatus === "completed" && statusResult.url) {
          updates.video_url = statusResult.url;
          updates.final_video_url = statusResult.url;
          updates.source_video_url = statusResult.url;
          updates.completed_at = new Date().toISOString();

          if (statusResult.thumbnail_url) {
            updates.thumbnail_url = statusResult.thumbnail_url;
          }

          console.log(`[ai-video-poll] ✅ Video ${video.id} completed`);
          results.completed++;
        }
        // Handle failure
        else if (mappedStatus === "failed") {
          updates.error = statusResult.error || "Video generation failed";
          console.log(`[ai-video-poll] ❌ Video ${video.id} failed:`, updates.error);
          results.failed++;
        }
        // Still processing
        else {
          console.log(`[ai-video-poll] ⏳ Video ${video.id} still processing`);
          results.still_processing++;
        }

        // Update the record
        const { error: updateError } = await sb
          .from("ai_videos")
          .update(updates)
          .eq("id", video.id);

        if (updateError) {
          console.error(`[ai-video-poll] Update error for ${video.id}:`, updateError);
          results.errors.push(`${video.id}: ${updateError.message}`);
        } else {
          results.updated++;
          console.log(`[ai-video-poll] Updated video ${video.id}`, {
            status: mappedStatus,
            hasUrl: !!updates.video_url,
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (videoErr: any) {
        console.error(`[ai-video-poll] Error polling video ${video.id}:`, videoErr.message);
        results.errors.push(`${video.id}: ${videoErr.message}`);
      }
    }

    const duration = Date.now() - startTime;

    console.log("[ai-video-poll] Poll complete", {
      ...results,
      duration_ms: duration,
    });

    return jsonResponse(200, {
      ok: true,
      message: "Poll complete",
      ...results,
      duration_ms: duration,
    });

  } catch (err: any) {
    console.error("[ai-video-poll] Fatal error:", err);

    return jsonResponse(500, {
      ok: false,
      error: "POLL_ERROR",
      message: err.message || "Failed to poll videos",
    });
  }
};

export default handler;
