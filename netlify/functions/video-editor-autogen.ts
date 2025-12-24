import type { Handler } from "@netlify/functions";
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
 * Simple beat detection: estimate BPM and create cut markers
 * For MVP, use default BPM of 120 (2 beats per second)
 */
function generateCutMarkers(targetSeconds: number, bpm: number = 120): number[] {
  const beatsPerSecond = bpm / 60;
  const beatInterval = 1 / beatsPerSecond;

  const markers: number[] = [];
  let time = 0;

  // Create markers every beat or half-beat
  const interval = beatInterval / 2; // Half-beat for more dynamic cuts

  while (time < targetSeconds) {
    markers.push(parseFloat(time.toFixed(2)));
    time += interval;
  }

  return markers;
}

/**
 * Split lyrics into cues with timing
 */
function splitLyricsIntoCues(
  lyrics: string,
  targetSeconds: number
): Array<{ startMs: number; endMs: number; text: string }> {
  const lines = lyrics
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const msPerLine = (targetSeconds * 1000) / lines.length;

  return lines.map((line, i) => ({
    startMs: Math.round(i * msPerLine),
    endMs: Math.round((i + 1) * msPerLine),
    text: line,
  }));
}

/**
 * Generate caption track from lyrics or default captions
 */
function generateCaptions(
  lyrics: string | null,
  targetSeconds: number,
  captionStyle: string = "minimal"
): Array<{
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  x: number;
  y: number;
  style: string;
}> {
  if (!lyrics) {
    // Generate default captions
    return [
      {
        id: `cap_${Date.now()}_0`,
        startMs: 0,
        endMs: targetSeconds * 1000,
        text: "🎵 Music Video",
        x: 50,
        y: 85,
        style: captionStyle,
      },
    ];
  }

  const cues = splitLyricsIntoCues(lyrics, targetSeconds);

  return cues.map((cue, index) => ({
    id: `cap_${Date.now()}_${index}`,
    ...cue,
    x: 50, // Center horizontally
    y: 85, // Bottom of screen
    style: captionStyle,
  }));
}

type AutogenBody = {
  video_id: string;
  audio_url?: string;
  lyrics?: string;
  caption_style?: string;
  beat_sync?: boolean;
  bpm?: number;
};

export const handler: Handler = async (event) => {
  console.log("[video-editor-autogen] Request received:", event.httpMethod);

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
    console.error("[video-editor-autogen] Auth error:", authError);
    return jsonResponse(401, { error: "UNAUTHORIZED" });
  }

  const userId = user.id;

  // Parse body
  let body: AutogenBody;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return jsonResponse(400, { error: "INVALID_JSON" });
  }

  const {
    video_id,
    audio_url,
    lyrics,
    caption_style = "minimal",
    beat_sync = true,
    bpm = 120,
  } = body;

  if (!video_id) {
    return jsonResponse(400, { error: "MISSING_VIDEO_ID" });
  }

  console.log("[video-editor-autogen] Generating for video:", video_id);

  try {
    // Fetch video record
    const { data: video, error: videoError } = await sb
      .from("video_generations")
      .select("*")
      .eq("id", video_id)
      .eq("user_id", userId)
      .single();

    if (videoError || !video) {
      console.error("[video-editor-autogen] Video not found:", videoError);
      return jsonResponse(404, { error: "VIDEO_NOT_FOUND" });
    }

    const targetSeconds = video.seconds;

    console.log("[video-editor-autogen] Target duration:", targetSeconds, "seconds");

    // Generate cut markers
    const cutMarkers = beat_sync ? generateCutMarkers(targetSeconds, bpm) : [];

    // Generate captions
    const captions = generateCaptions(lyrics || null, targetSeconds, caption_style);

    // Create loop plan with duration enforcement
    // If base footage is shorter than targetSeconds (or unknown), create loop plan
    // MVP: assume we may need to loop; actual video duration check would require video metadata
    const estimatedClipDuration = targetSeconds; // In production, get from video metadata
    let loopPlan;

    if (estimatedClipDuration < targetSeconds) {
      // Need to loop
      const segmentDuration = Math.min(3, targetSeconds); // Loop 3-second segments
      const repeatCount = Math.ceil(targetSeconds / segmentDuration);
      loopPlan = {
        mode: "loop",
        segments: [{ start: 0, end: segmentDuration, repeat: repeatCount }],
        totalSeconds: targetSeconds,
      };
    } else if (estimatedClipDuration > targetSeconds) {
      // Need to trim
      loopPlan = {
        mode: "trim",
        segments: [{ start: 0, end: targetSeconds, repeat: 1 }],
        totalSeconds: targetSeconds,
      };
    } else {
      // Exact match
      loopPlan = {
        mode: "none",
        segments: [{ start: 0, end: targetSeconds, repeat: 1 }],
        totalSeconds: targetSeconds,
      };
    }

    // Build edit JSON with exact spec structure
    const editJson = {
      targetSeconds,
      size: video.size,
      captions,
      cutMarkers,
      loopPlan,
      overlaysEnabled: {
        captions: true,
        lyrics: !!lyrics,
      },
      templateId: video.template_id,
      audioUrl: audio_url || null,
      captionStyle: caption_style,
      generatedAt: new Date().toISOString(),
    };

    console.log("[video-editor-autogen] Generated:", {
      captionsCount: captions.length,
      cutMarkersCount: cutMarkers.length,
    });

    // Upsert video_edits
    const { data: editRecord, error: editError } = await sb
      .from("video_edits")
      .upsert({
        video_id: video_id,
        user_id: userId,
        mode: "auto",
        edit_json: editJson,
        version: 1,
      })
      .select()
      .single();

    if (editError) {
      console.error("[video-editor-autogen] Edit upsert error:", editError);
      return jsonResponse(500, {
        error: "EDIT_UPSERT_ERROR",
        message: editError.message,
      });
    }

    // Save lyrics if provided
    if (lyrics) {
      const syncJson = captions.map((c) => ({
        startMs: c.startMs,
        endMs: c.endMs,
        text: c.text,
      }));

      const { error: lyricsError } = await sb.from("lyrics_tracks").upsert({
        video_id: video_id,
        user_id: userId,
        lyrics,
        sync_json: syncJson,
      });

      if (lyricsError) {
        console.warn("[video-editor-autogen] Lyrics save warning:", lyricsError);
      }
    }

    return jsonResponse(200, {
      success: true,
      edit_id: editRecord.id,
      edit_json: editJson,
      captions_count: captions.length,
      cut_markers_count: cutMarkers.length,
    });
  } catch (err: any) {
    console.error("[video-editor-autogen] Error:", err);

    return jsonResponse(500, {
      error: "AUTOGEN_ERROR",
      message: err.message || "Failed to auto-generate editor state",
    });
  }
};

export default handler;
