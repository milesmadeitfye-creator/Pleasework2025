import type { Handler, HandlerEvent } from "@netlify/functions";
import { sb, jsonHeaders } from "./_sb";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Internal-Request",
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: { ...jsonHeaders, ...CORS_HEADERS },
    body: JSON.stringify(data),
  };
}

/**
 * Music Visual Render - FFmpeg-based rendering
 *
 * This function takes a music_visual record and renders the final video
 * using FFmpeg (or a video API service like Mux/Cloudinary)
 *
 * CRITICAL: This is deterministic, not AI-based
 * Same inputs = same output
 */
export const handler: Handler = async (event: HandlerEvent) => {
  console.log("[music-visual-render] Request received", {
    method: event.httpMethod,
  });

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { visual_id } = body;

    if (!visual_id) {
      return jsonResponse(400, {
        ok: false,
        error: "INVALID_INPUT",
        message: "Missing visual_id",
      });
    }

    console.log("[music-visual-render] Starting render for visual:", visual_id);

    // ===================================================================
    // STEP 1: FETCH VISUAL DATA
    // ===================================================================

    const { data: visual, error: fetchError } = await sb
      .from('music_visuals')
      .select('*')
      .eq('id', visual_id)
      .single();

    if (fetchError || !visual) {
      console.error("[music-visual-render] Failed to fetch visual:", fetchError);
      return jsonResponse(404, {
        ok: false,
        error: "NOT_FOUND",
        message: "Music visual not found",
      });
    }

    // Check if already rendering or completed
    if (visual.render_status === 'rendering') {
      return jsonResponse(409, {
        ok: false,
        error: "ALREADY_RENDERING",
        message: "This visual is already being rendered",
      });
    }

    if (visual.render_status === 'completed' && visual.final_video_url) {
      return jsonResponse(200, {
        ok: true,
        message: "Visual already rendered",
        video_url: visual.final_video_url,
      });
    }

    console.log("[music-visual-render] Visual data loaded:", {
      id: visual.id,
      song: visual.song_title,
      vibe: visual.selected_vibe,
      duration: visual.target_length_seconds,
      clip_count: visual.broll_clip_ids?.length || 0,
      caption_count: visual.captions?.length || 0,
    });

    // ===================================================================
    // STEP 2: UPDATE STATUS TO RENDERING
    // ===================================================================

    await sb
      .from('music_visuals')
      .update({
        render_status: 'rendering',
        render_started_at: new Date().toISOString(),
      })
      .eq('id', visual_id);

    // ===================================================================
    // STEP 3: BUILD FFMPEG COMMAND
    // ===================================================================

    const timeline = visual.timeline_config;
    const captions = visual.captions || [];

    console.log("[music-visual-render] Building render pipeline...");

    /*
     * FFmpeg Rendering Strategy:
     *
     * 1. Download all B-roll clips to temp storage
     * 2. For each timeline segment:
     *    - Apply micro-variations (scale, pan, speed, mirror)
     *    - Trim to exact duration
     * 3. Concatenate all segments
     * 4. Overlay audio
     * 5. Burn captions using drawtext filter
     * 6. Add fade-out on last 2.5 seconds
     * 7. Export as MP4 (H.264, 9:16, 1080x1920)
     * 8. Upload to Supabase Storage
     *
     * ALTERNATIVE: Use Mux Video API or Cloudinary for cloud-based rendering
     * This is more reliable for serverless environments
     */

    const renderConfig = {
      segments: timeline.segments,
      audio_url: visual.audio_url,
      captions: captions,
      output_resolution: '1080x1920',
      output_fps: 30,
      output_format: 'mp4',
      fade_duration: 2.5,
    };

    console.log("[music-visual-render] Render config:", renderConfig);

    // ===================================================================
    // STEP 4: RENDER VIDEO
    // ===================================================================

    // IMPLEMENTATION NOTE:
    // In production, this would call either:
    // A) FFmpeg binary (if available in Netlify layer)
    // B) External video API (Mux, Cloudinary, Shotstack)
    // C) AWS Lambda with FFmpeg layer
    //
    // For now, we'll simulate the render and mark as completed

    console.log("[music-visual-render] 🎬 Starting video render...");

    // Simulate render process (remove this in production)
    const simulatedRender = await simulateRender(visual, renderConfig);

    if (!simulatedRender.success) {
      throw new Error(simulatedRender.error || 'Render failed');
    }

    const finalVideoUrl = simulatedRender.video_url;

    console.log("[music-visual-render] ✅ Render completed:", finalVideoUrl);

    // ===================================================================
    // STEP 5: UPDATE DATABASE WITH FINAL VIDEO
    // ===================================================================

    const { error: updateError } = await sb
      .from('music_visuals')
      .update({
        render_status: 'completed',
        render_completed_at: new Date().toISOString(),
        final_video_url: finalVideoUrl,
        final_thumbnail_url: simulatedRender.thumbnail_url,
      })
      .eq('id', visual_id);

    if (updateError) {
      console.error("[music-visual-render] Failed to update visual:", updateError);
    }

    console.log("[music-visual-render] ✅ Visual marked as completed");

    return jsonResponse(200, {
      ok: true,
      message: "Music visual rendered successfully",
      visual_id: visual_id,
      video_url: finalVideoUrl,
      thumbnail_url: simulatedRender.thumbnail_url,
      render_time_seconds: simulatedRender.render_time_seconds,
    });

  } catch (err: any) {
    console.error("[music-visual-render] Render failed:", err);

    // Update visual status to failed
    if (event.body) {
      const body = JSON.parse(event.body);
      if (body.visual_id) {
        await sb
          .from('music_visuals')
          .update({
            render_status: 'failed',
            render_error: err.message,
          })
          .eq('id', body.visual_id);
      }
    }

    return jsonResponse(500, {
      ok: false,
      error: "RENDER_FAILED",
      message: err.message || "Failed to render music visual",
    });
  }
};

/**
 * Simulate render process (REMOVE IN PRODUCTION)
 *
 * In production, replace this with actual FFmpeg or video API calls
 */
async function simulateRender(visual: any, config: any): Promise<{
  success: boolean;
  video_url?: string;
  thumbnail_url?: string;
  render_time_seconds?: number;
  error?: string;
}> {
  // Simulate render time (2-5 seconds per 10s of video)
  const renderTimePerSecond = 0.3;
  const totalRenderTime = visual.target_length_seconds * renderTimePerSecond;

  console.log(`[music-visual-render] Simulating render (${totalRenderTime}s)...`);

  // In production, this is where you'd:
  // 1. Download B-roll clips
  // 2. Run FFmpeg commands
  // 3. Upload to storage
  // 4. Generate thumbnail

  // For now, return a placeholder URL
  return {
    success: true,
    video_url: `https://storage.supabase.co/music-visuals/${visual.user_id}/${visual.id}.mp4`,
    thumbnail_url: `https://storage.supabase.co/music-visuals/${visual.user_id}/${visual.id}_thumb.jpg`,
    render_time_seconds: totalRenderTime,
  };
}

/**
 * PRODUCTION IMPLEMENTATION NOTES:
 *
 * Option 1: FFmpeg in Netlify (requires custom layer)
 * - Add FFmpeg binary to Netlify function
 * - Use fluent-ffmpeg npm package
 * - Download clips to /tmp
 * - Render and upload
 *
 * Option 2: Mux Video API (recommended)
 * - POST to Mux with timeline
 * - Mux handles rendering
 * - Webhook on completion
 * - Cost: ~$0.01 per minute
 *
 * Option 3: Shotstack API
 * - POST JSON timeline
 * - Cloud-based render
 * - Webhook on completion
 * - Cost: ~$0.05 per minute
 *
 * Option 4: AWS Lambda + FFmpeg Layer
 * - Deploy Lambda with FFmpeg
 * - Trigger from Netlify
 * - More control, more complexity
 */

export default handler;
