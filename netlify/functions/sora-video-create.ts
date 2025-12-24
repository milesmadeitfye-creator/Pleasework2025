import type { Handler } from "@netlify/functions";
import { sb, jsonHeaders } from "./_sb";
import { createVideoJob, buildPrompt, mapAspectRatioToSize } from "./_shared/soraVideo";
import { buildVideoPrompt, validateAudioRequirement } from "./_shared/promptBuilder";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEBUG_VERSION = "ai-videos-v2.0.0-audio-enforced";

// Validate critical env vars at startup
if (!process.env.SUPABASE_URL) {
  console.error("[sora-video-create] FATAL: SUPABASE_URL not set");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[sora-video-create] FATAL: SUPABASE_SERVICE_ROLE_KEY not set");
}

console.log("[sora-video-create] Module loaded:", {
  version: DEBUG_VERSION,
  hasSupabaseUrl: !!process.env.SUPABASE_URL,
  hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
});

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: { ...jsonHeaders, ...CORS_HEADERS },
    body: JSON.stringify(data),
  };
}

type CreateVideoBody = {
  templateId?: string;
  title?: string;
  prompt?: string;
  promptParts?: {
    vibe?: string;
    scene?: string;
    mood?: string;
    camera?: string;
    textStyle?: string;
    customText?: string;
  };
  isPro?: boolean;
  seconds?: number;
  targetSeconds?: number;
  size?: string;
  aspectRatio?: string;
  orientation?: 'vertical' | 'horizontal' | 'square';
  showLyrics?: boolean;
  lyricsText?: string;
  audioUrl?: string;
  audioSourceType?: 'upload' | 'link' | 'none';
  audioSha256?: string;
  usePromptBuilder?: boolean; // New flag to use AI prompt builder
};

export const handler: Handler = async (event) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[SoraCreate:${requestId}] Request received:`, {
    method: event.httpMethod,
    hasAuth: !!event.headers.authorization,
  });

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "METHOD_NOT_ALLOWED",
      step: "http_method_check",
      debug_version: DEBUG_VERSION
    });
  }

  // Validate auth
  const authHeader = event.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    console.error(`[SoraCreate:${requestId}] Missing auth header`);
    return jsonResponse(401, {
      error: "UNAUTHORIZED",
      step: "auth_failed",
      message: "Missing authorization header",
      debug_version: DEBUG_VERSION
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await sb.auth.getUser(token);

  if (authError || !user) {
    console.error(`[SoraCreate:${requestId}] Auth error:`, {
      error: authError?.message,
      code: authError?.code,
    });
    return jsonResponse(401, {
      error: "UNAUTHORIZED",
      step: "auth_failed",
      message: "Invalid or expired token",
      details: authError?.message,
      debug_version: DEBUG_VERSION
    });
  }

  const userId = user.id;
  console.log(`[SoraCreate:${requestId}] ✅ Authenticated:`, {
    userId: userId.substring(0, 8) + "...",
    email: user.email,
  });

  // Parse body
  let body: CreateVideoBody;
  try {
    body = JSON.parse(event.body || "{}");
    console.log(`[SoraCreate:${requestId}] Request body:`, {
      hasTitle: !!body.title,
      hasPrompt: !!body.prompt,
      hasPromptParts: !!body.promptParts,
      model: body.isPro ? "sora-2-pro" : "sora-2",
      seconds: body.seconds,
      targetSeconds: body.targetSeconds,
      size: body.size,
      aspectRatio: body.aspectRatio,
    });
  } catch (err) {
    console.error(`[SoraCreate:${requestId}] Invalid JSON:`, err);
    return jsonResponse(400, {
      error: "INVALID_JSON",
      step: "parse_body",
      message: "Request body is not valid JSON",
      debug_version: DEBUG_VERSION
    });
  }

  const {
    templateId,
    title,
    prompt: userPrompt,
    promptParts,
    isPro = false,
    seconds = 8,
    targetSeconds,
    size: userSize,
    aspectRatio,
    orientation = 'vertical',
    showLyrics = false,
    lyricsText,
    audioUrl,
    audioSourceType = 'none',
    audioSha256,
    usePromptBuilder = true, // Default to using AI prompt builder
  } = body;

  // Determine target duration
  const requestedSeconds = targetSeconds ?? seconds;

  // ✅ VALIDATE AUDIO REQUIREMENT
  const audioValidation = validateAudioRequirement(audioUrl, audioSourceType);
  if (!audioValidation.valid) {
    console.error(`[SoraCreate:${requestId}] Audio validation failed:`, audioValidation.error);
    return jsonResponse(400, {
      error: "AUDIO_VALIDATION_FAILED",
      step: "validate_audio",
      message: audioValidation.error,
      debug_version: DEBUG_VERSION
    });
  }

  // Build final prompt using AI prompt builder or legacy method
  let finalPrompt: string;
  let promptAnalysis: any = null;

  if (usePromptBuilder && userPrompt) {
    // ✅ Use AI prompt builder for structured B-roll prompts
    console.log(`[SoraCreate:${requestId}] Using AI prompt builder`);
    promptAnalysis = buildVideoPrompt(userPrompt, {
      seconds: requestedSeconds,
      orientation,
      platform: 'general',
    });
    finalPrompt = promptAnalysis.final_prompt;
    console.log(`[SoraCreate:${requestId}] Generated prompt analysis:`, {
      broll_style: promptAnalysis.broll_style,
      shot_count: promptAnalysis.shot_list.length,
      prompt_length: finalPrompt.length,
    });
  } else if (userPrompt) {
    // Use user prompt as-is
    finalPrompt = userPrompt;
  } else if (promptParts) {
    // Legacy prompt parts builder
    finalPrompt = buildPrompt({
      ...promptParts,
      seconds: requestedSeconds,
      size: userSize,
    });
  } else {
    console.error(`[SoraCreate:${requestId}] Missing prompt`);
    return jsonResponse(400, {
      error: "MISSING_PROMPT",
      step: "validate_input",
      message: "Either 'prompt' or 'promptParts' is required",
      debug_version: DEBUG_VERSION
    });
  }

  // Determine size/aspect ratio
  const finalSize = userSize || mapAspectRatioToSize(aspectRatio) || "720x1280";
  const finalAspectRatio = aspectRatio || "9:16";

  // Determine model
  const model = isPro ? "sora-2-pro" : "sora-2";

  console.log(`[SoraCreate:${requestId}] 📹 Creating video:`, {
    userId: userId.substring(0, 8) + "...",
    model,
    seconds: requestedSeconds,
    size: finalSize,
    aspectRatio: finalAspectRatio,
    promptLength: finalPrompt.length,
    hasTitle: !!title,
    hasAudio: !!audioUrl,
  });

  try {
    // Call Sora API
    console.log(`[SoraCreate:${requestId}] 🎬 Creating Sora job...`);
    const jobResult = await createVideoJob({
      prompt: finalPrompt,
      model,
      seconds: requestedSeconds,
      size: finalSize,
    });

    console.log(`[SoraCreate:${requestId}] Raw Sora response (trimmed):`, {
      response_keys: Object.keys(jobResult),
      response_sample: JSON.stringify(jobResult).substring(0, 300),
    });

    // ✅ ROBUST JOB ID EXTRACTION - Try multiple paths
    let jobId: string | null = null;

    // Attempt 1: Direct id field
    if (jobResult.id) {
      jobId = jobResult.id;
      console.log(`[SoraCreate:${requestId}] ✅ Extracted jobId from response.id:`, jobId);
    }
    // Attempt 2: job_id field
    else if ((jobResult as any).job_id) {
      jobId = (jobResult as any).job_id;
      console.log(`[SoraCreate:${requestId}] ✅ Extracted jobId from response.job_id:`, jobId);
    }
    // Attempt 3: data.id
    else if ((jobResult as any).data?.id) {
      jobId = (jobResult as any).data.id;
      console.log(`[SoraCreate:${requestId}] ✅ Extracted jobId from response.data.id:`, jobId);
    }
    // Attempt 4: data.job_id
    else if ((jobResult as any).data?.job_id) {
      jobId = (jobResult as any).data.job_id;
      console.log(`[SoraCreate:${requestId}] ✅ Extracted jobId from response.data.job_id:`, jobId);
    }
    // Attempt 5: result.id
    else if ((jobResult as any).result?.id) {
      jobId = (jobResult as any).result.id;
      console.log(`[SoraCreate:${requestId}] ✅ Extracted jobId from response.result.id:`, jobId);
    }
    // Attempt 6: result.job_id
    else if ((jobResult as any).result?.job_id) {
      jobId = (jobResult as any).result.job_id;
      console.log(`[SoraCreate:${requestId}] ✅ Extracted jobId from response.result.job_id:`, jobId);
    }
    // Attempt 7: Search for any field containing "job" in top-level keys
    else {
      const allKeys = Object.keys(jobResult);
      const jobKeys = allKeys.filter(k => k.toLowerCase().includes('job'));
      console.log(`[SoraCreate:${requestId}] ⚠️ Searching for job-related keys:`, jobKeys);

      for (const key of jobKeys) {
        const value = (jobResult as any)[key];
        if (typeof value === 'string' && value.length > 0) {
          jobId = value;
          console.log(`[SoraCreate:${requestId}] ✅ Found jobId in response.${key}:`, jobId);
          break;
        }
      }
    }

    // Validate job_id is present after all attempts
    if (!jobId || jobId.trim() === '') {
      console.error(`[SoraCreate:${requestId}] ❌ CRITICAL: Missing job_id after all extraction attempts`);
      console.error(`[SoraCreate:${requestId}] Full response:`, JSON.stringify(jobResult, null, 2));

      // Create a failed record in database
      try {
        await sb.from("ai_videos").insert({
          user_id: userId,
          title: title || null,
          prompt: userPrompt || finalPrompt.substring(0, 500),
          model,
          is_pro: isPro,
          duration_seconds: requestedSeconds,
          aspect_ratio: finalAspectRatio,
          status: "failed",
          provider: "sora",
          error: "Sora response missing job_id - cannot track video generation",
        });
        console.log(`[SoraCreate:${requestId}] Saved failed record to database`);
      } catch (failErr: any) {
        console.error(`[SoraCreate:${requestId}] Failed to save failed record:`, failErr.message);
      }

      return jsonResponse(500, {
        ok: false,
        error: "MISSING_JOB_ID",
        message: "Sora API did not return a job ID. Cannot track video generation.",
        debug: {
          response_keys: Object.keys(jobResult),
          response_sample: JSON.stringify(jobResult).substring(0, 500),
        },
        debug_version: DEBUG_VERSION,
      });
    }

    console.log(`[SoraCreate:${requestId}] ✅ Sora job created successfully:`, {
      provider: "sora",
      job_id: jobId,
      status: jobResult.status,
      hasUrl: !!jobResult.url,
    });

    // Insert into ai_videos table (NOT video_generations)
    console.log(`[SoraCreate:${requestId}] 💾 Inserting record into ai_videos...`);

    const insertPayload = {
      user_id: userId,
      title: title || null,
      prompt: userPrompt || finalPrompt.substring(0, 500), // Store original user prompt
      final_prompt: finalPrompt, // Store full structured prompt
      model,
      is_pro: isPro,
      duration_seconds: requestedSeconds,
      aspect_ratio: finalAspectRatio,
      status: jobResult.status === "completed" ? "completed" : "queued",
      // ✅ PERSIST JOB ID IN ALL THREE COLUMNS
      job_id: jobId,
      provider_job_id: jobId,
      sora_job_id: jobId,
      provider: "sora",
      video_url: jobResult.url || null,
      source_video_url: jobResult.url || null, // Raw Sora output
      final_video_url: jobResult.url || null, // Will be updated after processing
      audio_source_type: audioSourceType,
      audio_url: audioUrl || null,
      audio_sha256: audioSha256 || null,
      lyrics_text: lyricsText || null,
      broll_style: promptAnalysis?.broll_style || null,
      shot_list: promptAnalysis?.shot_list ? JSON.stringify(promptAnalysis.shot_list) : null,
    };

    console.log(`[SoraCreate:${requestId}] Insert payload:`, {
      keys: Object.keys(insertPayload),
      job_id: insertPayload.job_id,
      provider_job_id: insertPayload.provider_job_id,
      sora_job_id: insertPayload.sora_job_id,
      status: insertPayload.status,
    });

    const { data: videoRecord, error: dbError } = await sb
      .from("ai_videos")
      .insert(insertPayload)
      .select()
      .single();

    if (dbError) {
      console.error(`[SoraCreate:${requestId}] ❌ DB INSERT FAILED:`, {
        step: "db_insert_failed",
        error: dbError.message,
        code: dbError.code,
        details: dbError.details,
        hint: dbError.hint,
        table: "ai_videos",
        operation: "INSERT",
        job_id: jobId,
        userId: userId.substring(0, 8) + "...",
        hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        insertPayloadSample: {
          user_id_length: insertPayload.user_id?.length,
          prompt_length: insertPayload.prompt?.length,
          model: insertPayload.model,
          status: insertPayload.status,
          job_id: insertPayload.job_id,
          provider_job_id: insertPayload.provider_job_id,
          sora_job_id: insertPayload.sora_job_id,
        },
      });

      // FAIL LOUDLY - frontend needs to know save failed
      return jsonResponse(500, {
        ok: false,
        error: "DB_INSERT_FAILED",
        step: "db_insert_failed",
        message: `Database insert failed: ${dbError.message}. Job was created in Sora but not saved to database.`,
        job_id: jobId,
        details: dbError.message,
        code: dbError.code,
        hint: dbError.hint,
        debug_version: DEBUG_VERSION,
      });
    }

    // Verify job ID was persisted
    if (!videoRecord.provider_job_id || !videoRecord.sora_job_id) {
      console.error(`[SoraCreate:${requestId}] ⚠️ WARNING: Job ID not persisted correctly`, {
        video_id: videoRecord.id,
        job_id: videoRecord.job_id,
        provider_job_id: videoRecord.provider_job_id,
        sora_job_id: videoRecord.sora_job_id,
      });
    }

    console.log(`[SoraCreate:${requestId}] ✅ Video record created successfully:`, {
      video_id: videoRecord.id,
      job_id: videoRecord.job_id,
      provider_job_id: videoRecord.provider_job_id,
      sora_job_id: videoRecord.sora_job_id,
      status: videoRecord.status,
      hasUrl: !!videoRecord.video_url,
    });

    console.log(`[SoraCreate:${requestId}] 🎉 SUCCESS - videoId=${videoRecord.id} jobId=${jobId}`);

    return jsonResponse(200, {
      ok: true,
      video_id: videoRecord.id,
      job_id: jobId,
      provider_job_id: videoRecord.provider_job_id,
      sora_job_id: videoRecord.sora_job_id,
      status: videoRecord.status,
      debug_version: DEBUG_VERSION,
      debug: {
        job_id_source: jobResult.id ? 'response.id' : 'fallback extraction',
        all_columns_populated: !!(videoRecord.job_id && videoRecord.provider_job_id && videoRecord.sora_job_id),
      },
    });
  } catch (err: any) {
    console.error(`[SoraCreate:${requestId}] ❌ FATAL ERROR:`, {
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 3),
      step: err.step || "unknown",
    });

    // Try to save failed record
    try {
      console.log(`[SoraCreate:${requestId}] Attempting to save failed record...`);
      await sb.from("ai_videos").insert({
        user_id: userId,
        title: title || null,
        job_id: null,
        provider_job_id: null,
        sora_job_id: null,
        model,
        prompt: finalPrompt,
        is_pro: isPro,
        duration_seconds: requestedSeconds,
        aspect_ratio: finalAspectRatio,
        status: "failed",
        provider: "sora",
        video_url: null,
        error: err.message,
      });
      console.log(`[SoraCreate:${requestId}] Failed record saved`);
    } catch (failedInsertErr: any) {
      console.error(`[SoraCreate:${requestId}] Failed to save failed record:`, {
        error: failedInsertErr.message,
        code: failedInsertErr.code,
      });
    }

    return jsonResponse(500, {
      ok: false,
      error: "VIDEO_CREATE_ERROR",
      step: err.step || "provider_create_failed",
      message: err.message || "Failed to create video",
      details: err.toString(),
      debug_version: DEBUG_VERSION,
    });
  }
};

export default handler;
