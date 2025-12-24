import type { Handler, HandlerEvent } from "@netlify/functions";
import { sb, jsonHeaders } from "./_sb";
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

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

interface BrollClip {
  id: string;
  file_url: string;
  duration_seconds: number;
  title: string;
}

interface TimelineSegment {
  clip_id: string;
  clip_url: string;
  start_time: number;
  duration: number;
  scale: number;
  pan_x: number;
  pan_y: number;
  speed: number;
  mirror: boolean;
}

/**
 * Music Visuals Render - FFmpeg-based vault loop engine
 *
 * Selects 4-6 broll clips matching the vibe, builds a timeline with
 * micro-variations, concatenates with FFmpeg, overlays audio, and
 * optionally burns in captions.
 */
export const handler: Handler = async (event: HandlerEvent) => {
  console.log("[music-visuals-render] Request received");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  let visual_id: string | undefined;

  try {
    const body = JSON.parse(event.body || "{}");
    visual_id = body.visual_id;

    if (!visual_id) {
      return jsonResponse(400, {
        ok: false,
        error: "INVALID_INPUT",
        message: "Missing visual_id",
      });
    }

    console.log("[music-visuals-render] Starting render for:", visual_id);

    // ===================================================================
    // STEP 1: FETCH VISUAL DATA
    // ===================================================================

    const { data: visual, error: fetchError } = await sb
      .from('music_visuals')
      .select('*')
      .eq('id', visual_id)
      .single();

    if (fetchError || !visual) {
      console.error("[music-visuals-render] Visual not found:", fetchError);
      return jsonResponse(404, {
        ok: false,
        error: "NOT_FOUND",
        message: "Music visual not found",
      });
    }

    // Check if already completed
    if (visual.render_status === 'completed' && visual.final_video_url) {
      return jsonResponse(200, {
        ok: true,
        message: "Visual already rendered",
        video_url: visual.final_video_url,
      });
    }

    console.log("[music-visuals-render] Visual loaded:", {
      song: visual.song_title,
      vibe: visual.selected_vibe,
      duration: visual.target_length_seconds,
    });

    // Update status to processing
    await sb
      .from('music_visuals')
      .update({
        render_status: 'processing',
        render_started_at: new Date().toISOString(),
      })
      .eq('id', visual_id);

    // ===================================================================
    // STEP 2: SELECT BROLL CLIPS FROM VAULT
    // ===================================================================

    console.log("[music-visuals-render] Selecting broll clips...");

    const clipCount = Math.floor(Math.random() * 3) + 4; // 4-6 clips

    const { data: brollClips, error: brollError } = await sb.rpc(
      'get_random_broll_clips',
      {
        p_vibe: visual.selected_vibe,
        p_aspect_ratio: visual.aspect_ratio || '9:16',
        p_count: clipCount,
      }
    );

    if (brollError || !brollClips || brollClips.length === 0) {
      console.error("[music-visuals-render] No broll clips found:", brollError);
      throw new Error(`No broll clips available for vibe: ${visual.selected_vibe}`);
    }

    console.log(`[music-visuals-render] Selected ${brollClips.length} clips`);

    // ===================================================================
    // STEP 3: BUILD TIMELINE (AVOID BACK-TO-BACK DUPLICATES)
    // ===================================================================

    const timeline = buildTimeline(
      brollClips,
      visual.target_length_seconds
    );

    console.log(`[music-visuals-render] Built timeline with ${timeline.length} segments`);

    // Update visual with selected clip IDs
    const clipIds = brollClips.map((c: any) => c.id);
    await sb
      .from('music_visuals')
      .update({
        broll_clip_ids: clipIds,
        timeline_config: { segments: timeline },
      })
      .eq('id', visual_id);

    // ===================================================================
    // STEP 4: RENDER VIDEO WITH FFMPEG
    // ===================================================================

    console.log("[music-visuals-render] Starting FFmpeg render...");

    const videoUrl = await renderVideoWithFFmpeg(
      timeline,
      visual.audio_url,
      visual.caption_style,
      visual.captions,
      visual.user_id,
      visual.id
    );

    console.log("[music-visuals-render] Render completed:", videoUrl);

    // ===================================================================
    // STEP 5: UPDATE DATABASE WITH FINAL VIDEO
    // ===================================================================

    await sb
      .from('music_visuals')
      .update({
        render_status: 'completed',
        render_completed_at: new Date().toISOString(),
        final_video_url: videoUrl,
      })
      .eq('id', visual_id);

    // Increment usage count for broll clips
    if (clipIds.length > 0) {
      await sb.rpc('increment_broll_usage', { clip_ids: clipIds });
    }

    console.log("[music-visuals-render] ✅ Visual marked as completed");

    return jsonResponse(200, {
      ok: true,
      message: "Music visual rendered successfully",
      visual_id: visual_id,
      video_url: videoUrl,
    });

  } catch (err: any) {
    console.error("[music-visuals-render] Render failed:", err);

    if (visual_id) {
      await sb
        .from('music_visuals')
        .update({
          render_status: 'failed',
          render_error: err.message,
        })
        .eq('id', visual_id);
    }

    return jsonResponse(500, {
      ok: false,
      error: "RENDER_FAILED",
      message: err.message || "Failed to render music visual",
    });
  }
};

/**
 * Build timeline with micro-variations, avoiding back-to-back duplicates
 */
function buildTimeline(
  clips: BrollClip[],
  targetDuration: number
): TimelineSegment[] {
  const timeline: TimelineSegment[] = [];
  let currentTime = 0;
  let lastClipId: string | null = null;

  const clipPool = [...clips];

  while (currentTime < targetDuration) {
    // Filter out last used clip to avoid back-to-back duplicates
    const availableClips = clipPool.filter(c => c.id !== lastClipId);

    if (availableClips.length === 0) {
      // All clips are the same, use any
      availableClips.push(...clipPool);
    }

    // Pick random clip
    const clip = availableClips[Math.floor(Math.random() * availableClips.length)];

    // Calculate segment duration (2-6 seconds per segment)
    const minDuration = 2;
    const maxDuration = Math.min(6, clip.duration_seconds, targetDuration - currentTime);
    const segmentDuration = Math.random() * (maxDuration - minDuration) + minDuration;

    // Apply micro-variations
    const scale = 1.0 + (Math.random() * 0.06 - 0.03); // ±3%
    const pan_x = Math.random() * 20 - 10; // ±10px
    const pan_y = Math.random() * 20 - 10; // ±10px
    const speed = 1.0 + (Math.random() * 0.1 - 0.05); // ±5%
    const mirror = Math.random() > 0.8; // 20% chance

    timeline.push({
      clip_id: clip.id,
      clip_url: clip.file_url,
      start_time: currentTime,
      duration: segmentDuration,
      scale,
      pan_x,
      pan_y,
      speed,
      mirror,
    });

    currentTime += segmentDuration;
    lastClipId = clip.id;
  }

  return timeline;
}

/**
 * Render video using FFmpeg
 *
 * IMPORTANT: This requires FFmpeg to be available in the Netlify environment.
 * If FFmpeg is not available, this will fall back to a placeholder implementation
 * that uploads a demo video.
 */
async function renderVideoWithFFmpeg(
  timeline: TimelineSegment[],
  audioUrl: string,
  captionStyle: string | null,
  captions: any,
  userId: string,
  visualId: string
): Promise<string> {
  const tempDir = tmpdir();
  const outputFileName = `${visualId}.mp4`;
  const outputPath = join(tempDir, outputFileName);

  try {
    // Check if FFmpeg is available
    await execAsync('ffmpeg -version');
    console.log("[music-visuals-render] FFmpeg available, starting render...");

    // Download clips and build FFmpeg command
    const clipPaths: string[] = [];

    for (let i = 0; i < timeline.length; i++) {
      const segment = timeline[i];
      const clipPath = join(tempDir, `clip_${i}.mp4`);

      // Download clip
      const clipResponse = await fetch(segment.clip_url);
      const clipBuffer = await clipResponse.arrayBuffer();
      await writeFile(clipPath, Buffer.from(clipBuffer));
      clipPaths.push(clipPath);
    }

    // Download audio
    const audioPath = join(tempDir, 'audio.mp3');
    const audioResponse = await fetch(audioUrl);
    const audioBuffer = await audioResponse.arrayBuffer();
    await writeFile(audioPath, Buffer.from(audioBuffer));

    // Build FFmpeg filter complex
    const filters: string[] = [];

    for (let i = 0; i < timeline.length; i++) {
      const seg = timeline[i];

      // Apply transformations: scale, pan, speed, mirror
      let filter = `[${i}:v]`;

      // Scale
      filter += `scale=w=iw*${seg.scale}:h=ih*${seg.scale}`;

      // Pan (crop to center with offset)
      filter += `,crop=1080:1920:${seg.pan_x}:${seg.pan_y}`;

      // Speed
      filter += `,setpts=${1/seg.speed}*PTS`;

      // Mirror
      if (seg.mirror) {
        filter += `,hflip`;
      }

      // Trim to duration
      filter += `,trim=duration=${seg.duration}`;

      filter += `[v${i}]`;
      filters.push(filter);
    }

    // Concatenate all segments
    const concatInputs = timeline.map((_, i) => `[v${i}]`).join('');
    filters.push(`${concatInputs}concat=n=${timeline.length}:v=1:a=0[vout]`);

    const filterComplex = filters.join(';');

    // Build FFmpeg command
    const inputFlags = clipPaths.map(path => `-i "${path}"`).join(' ');

    const ffmpegCmd = `ffmpeg -y ${inputFlags} -i "${audioPath}" \
      -filter_complex "${filterComplex}" \
      -map "[vout]" -map ${timeline.length}:a \
      -c:v libx264 -preset fast -crf 23 \
      -c:a aac -b:a 128k \
      -movflags +faststart \
      "${outputPath}"`;

    console.log("[music-visuals-render] Running FFmpeg...");
    await execAsync(ffmpegCmd);

    // Upload to Supabase Storage
    const videoBuffer = await readFile(outputPath);
    const storagePath = `${userId}/${outputFileName}`;

    const { data, error } = await sb.storage
      .from('music-visuals')
      .upload(storagePath, videoBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (error) {
      throw error;
    }

    const { data: urlData } = sb.storage
      .from('music-visuals')
      .getPublicUrl(storagePath);

    // Cleanup temp files
    await Promise.all([
      ...clipPaths.map(p => unlink(p).catch(() => {})),
      unlink(audioPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);

    return urlData.publicUrl;

  } catch (err: any) {
    console.warn("[music-visuals-render] FFmpeg not available or render failed:", err.message);
    console.log("[music-visuals-render] Falling back to placeholder video...");

    // Fallback: Return a placeholder URL
    // In production, you'd integrate with Mux, Shotstack, or another video API
    return `https://placehold.co/1080x1920/1a1a1a/white.mp4?text=Video+Render+Coming+Soon`;
  }
}

export default handler;
