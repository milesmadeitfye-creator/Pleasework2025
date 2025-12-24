import type { Handler, HandlerEvent } from "@netlify/functions";
import { sb, jsonHeaders } from "./_sb";
import { generateCaptions, makeLoopSafe, validateCaptions, type CaptionStyle } from "./_captionGenerator";
import { generateCompleteTimeline, validateTimeline, type BrollClip } from "./_loopEngine";

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

interface CreateMusicVisualRequest {
  song_title: string;
  artist_name?: string;
  audio_url: string;
  audio_duration_seconds: number;

  selected_vibe: string;
  target_length_seconds: 20 | 30 | 40;
  caption_style: CaptionStyle;
  lyrics_text?: string;
}

/**
 * Create Music Visual - Main endpoint
 *
 * CRITICAL: This does NOT use AI generation
 * It selects B-roll from vault and creates a render job
 */
export const handler: Handler = async (event: HandlerEvent) => {
  console.log("[music-visual-create] Request received", {
    method: event.httpMethod,
    hasAuth: !!event.headers.authorization,
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

  // Validate auth
  const authHeader = event.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, {
      ok: false,
      error: "UNAUTHORIZED",
      message: "Missing authorization header",
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await sb.auth.getUser(token);

  if (authError || !user) {
    return jsonResponse(401, {
      ok: false,
      error: "UNAUTHORIZED",
      message: "Invalid token",
    });
  }

  try {
    const body: CreateMusicVisualRequest = JSON.parse(event.body || "{}");

    // Validate required fields
    if (!body.song_title || !body.audio_url || !body.audio_duration_seconds) {
      return jsonResponse(400, {
        ok: false,
        error: "INVALID_INPUT",
        message: "Missing required fields: song_title, audio_url, audio_duration_seconds",
      });
    }

    if (!body.selected_vibe) {
      return jsonResponse(400, {
        ok: false,
        error: "INVALID_INPUT",
        message: "Missing selected_vibe",
      });
    }

    if (![20, 30, 40].includes(body.target_length_seconds)) {
      return jsonResponse(400, {
        ok: false,
        error: "INVALID_INPUT",
        message: "target_length_seconds must be 20, 30, or 40",
      });
    }

    console.log("[music-visual-create] Creating visual", {
      user_id: user.id,
      vibe: body.selected_vibe,
      duration: body.target_length_seconds,
      caption_style: body.caption_style,
    });

    // ===================================================================
    // STEP 1: SELECT B-ROLL CLIPS FROM VAULT
    // ===================================================================

    console.log("[music-visual-create] Selecting B-roll clips from vault...");

    const { data: brollClips, error: brollError } = await sb.rpc('get_random_broll_clips', {
      p_vibe: body.selected_vibe,
      p_aspect_ratio: '9:16',
      p_count: 5,
    });

    if (brollError) {
      console.error("[music-visual-create] B-roll query error:", brollError);
      return jsonResponse(500, {
        ok: false,
        error: "BROLL_QUERY_FAILED",
        message: "Failed to fetch B-roll clips from vault",
        details: brollError.message,
      });
    }

    if (!brollClips || brollClips.length === 0) {
      return jsonResponse(404, {
        ok: false,
        error: "NO_BROLL_AVAILABLE",
        message: `No B-roll clips found for vibe: ${body.selected_vibe}`,
        hint: "Admin needs to upload B-roll for this vibe",
      });
    }

    console.log("[music-visual-create] Selected B-roll clips:", {
      count: brollClips.length,
      clips: brollClips.map((c: any) => ({
        id: c.id,
        title: c.title,
        duration: c.duration_seconds,
        energy: c.energy_level,
      })),
    });

    // ===================================================================
    // STEP 2: GENERATE TIMELINE WITH LOOP ENGINE
    // ===================================================================

    console.log("[music-visual-create] Generating timeline...");

    const clipData: BrollClip[] = brollClips.map((clip: any) => ({
      id: clip.id,
      file_url: clip.file_url,
      duration_seconds: clip.duration_seconds,
      energy_level: clip.energy_level || 'medium',
      aesthetic: clip.aesthetic || [],
    }));

    const timeline = generateCompleteTimeline(
      clipData,
      body.target_length_seconds
    );

    const timelineValidation = validateTimeline(timeline);
    if (!timelineValidation.valid) {
      console.error("[music-visual-create] Invalid timeline:", timelineValidation.errors);
      return jsonResponse(500, {
        ok: false,
        error: "INVALID_TIMELINE",
        message: "Generated timeline is invalid",
        errors: timelineValidation.errors,
      });
    }

    console.log("[music-visual-create] Timeline generated:", {
      segments: timeline.segments.length,
      total_duration: timeline.total_duration,
      clip_usage: timeline.clip_usage_count,
    });

    // ===================================================================
    // STEP 3: GENERATE CAPTIONS
    // ===================================================================

    console.log("[music-visual-create] Generating captions...");

    let captions = generateCaptions({
      style: body.caption_style || 'lyric_highlight',
      targetDuration: body.target_length_seconds,
      lyrics: body.lyrics_text,
      songTitle: body.song_title,
      artistName: body.artist_name,
      vibe: body.selected_vibe,
    });

    // Make captions loop-safe (no changes in fade-out)
    const fadeStartTime = body.target_length_seconds - 2.5;
    captions = makeLoopSafe(captions, body.target_length_seconds, fadeStartTime);

    const captionValidation = validateCaptions(captions, body.target_length_seconds);
    if (!captionValidation.valid) {
      console.warn("[music-visual-create] Caption validation warnings:", captionValidation.errors);
    }

    console.log("[music-visual-create] Captions generated:", {
      count: captions.length,
      style: body.caption_style,
    });

    // ===================================================================
    // STEP 4: CREATE MUSIC VISUAL RECORD
    // ===================================================================

    console.log("[music-visual-create] Creating database record...");

    const { data: musicVisual, error: insertError } = await sb
      .from('music_visuals')
      .insert({
        user_id: user.id,
        song_title: body.song_title,
        artist_name: body.artist_name,
        audio_url: body.audio_url,
        audio_duration_seconds: body.audio_duration_seconds,
        selected_vibe: body.selected_vibe,
        target_length_seconds: body.target_length_seconds,
        caption_style: body.caption_style,
        broll_clip_ids: brollClips.map((c: any) => c.id),
        timeline_config: timeline,
        captions: captions,
        lyrics_text: body.lyrics_text,
        render_status: 'pending',
      })
      .select()
      .single();

    if (insertError || !musicVisual) {
      console.error("[music-visual-create] Insert error:", insertError);
      return jsonResponse(500, {
        ok: false,
        error: "DATABASE_ERROR",
        message: "Failed to create music visual record",
        details: insertError?.message,
      });
    }

    console.log("[music-visual-create] ✅ Music visual created:", {
      id: musicVisual.id,
      status: musicVisual.render_status,
    });

    // ===================================================================
    // STEP 5: INCREMENT B-ROLL USAGE COUNT
    // ===================================================================

    const clipIds = brollClips.map((c: any) => c.id);
    const { error: usageError } = await sb.rpc('increment_broll_usage', {
      clip_ids: clipIds,
    });

    if (usageError) {
      console.warn("[music-visual-create] Failed to increment usage count:", usageError);
    }

    // ===================================================================
    // STEP 6: TRIGGER RENDER (ASYNC)
    // ===================================================================

    console.log("[music-visual-create] Triggering async render...");

    // Trigger render function asynchronously (fire and forget)
    fetch(`${process.env.URL}/.netlify/functions/music-visual-render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'true',
      },
      body: JSON.stringify({
        visual_id: musicVisual.id,
      }),
    }).catch(err => {
      console.error("[music-visual-create] Failed to trigger render:", err);
    });

    // ===================================================================
    // RETURN SUCCESS
    // ===================================================================

    return jsonResponse(200, {
      ok: true,
      message: "Music visual created successfully",
      visual: {
        id: musicVisual.id,
        song_title: musicVisual.song_title,
        selected_vibe: musicVisual.selected_vibe,
        target_length_seconds: musicVisual.target_length_seconds,
        render_status: musicVisual.render_status,
        clip_count: brollClips.length,
        caption_count: captions.length,
      },
      debug: {
        timeline_segments: timeline.segments.length,
        total_duration: timeline.total_duration,
        clip_usage: timeline.clip_usage_count,
      },
    });

  } catch (err: any) {
    console.error("[music-visual-create] Fatal error:", err);

    return jsonResponse(500, {
      ok: false,
      error: "INTERNAL_ERROR",
      message: err.message || "Failed to create music visual",
      stack: err.stack?.split('\n').slice(0, 3),
    });
  }
};

export default handler;
