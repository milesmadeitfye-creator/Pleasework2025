import type { Handler } from '@netlify/functions';
import OpenAI from 'openai';
import { sb, jsonHeaders } from './_sb';
import { createSoraVideoJob } from './_shared/openaiVideo';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn('[ai-video] OPENAI_API_KEY is not set');
}

// Keep this for debug purposes
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify(data),
  };
}

type CreateVideoBody = {
  prompt: string;
  model?: 'sora-2' | 'sora-2-pro';  // Model selection
  aspectRatio?: string;          // e.g. "9:16", "16:9", "1:1", "21:9"
  clipLengthSeconds?: number;    // 15 / 30 / 60 from UI
  clipStartSeconds?: number;     // Start time for clip selection
  audioUrl?: string | null;      // public Supabase URL for the song (stored but not sent to OpenAI)
  targetPlatforms?: string[];    // ["meta", "tiktok", ...] (unused for API but kept for future)
  campaignPreset?: string | null;
};

function mapAspectRatio(aspectRatio?: string | null): string {
  // Sora 2 supports: "16:9", "9:16", "1:1"
  switch (aspectRatio) {
    case '9:16':
    case 'vertical':
      return '9:16';
    case '16:9':
    case 'horizontal':
      return '16:9';
    case '1:1':
    case 'square':
      return '1:1';
    case '21:9':
    case 'cinematic':
      return '16:9'; // Fallback to 16:9 for cinematic
    default:
      return '9:16'; // Fallback to vertical for reels/TikTok
  }
}

export const handler: Handler = async (event) => {
  console.log('[ai-video-create] Request received:', event.httpMethod);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  }

  if (!OPENAI_API_KEY) {
    return jsonResponse(500, {
      error: 'MISSING_OPENAI_KEY',
      message: 'OPENAI_API_KEY is not configured on the server',
    });
  }

  let body: CreateVideoBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    console.error('[ai-video-create] Failed to parse body', err);
    return jsonResponse(400, {
      error: 'INVALID_JSON',
      message: 'Request body must be valid JSON',
    });
  }

  const { prompt, model, aspectRatio, clipLengthSeconds, clipStartSeconds, audioUrl } = body;

  if (!prompt || typeof prompt !== 'string') {
    return jsonResponse(400, {
      error: 'PROMPT_REQUIRED',
      message: 'A prompt is required to generate video',
    });
  }

  // Validate model if provided
  const videoModel = model || 'sora-2';
  if (videoModel !== 'sora-2' && videoModel !== 'sora-2-pro') {
    return jsonResponse(400, {
      error: 'INVALID_MODEL',
      message: 'Model must be either sora-2 or sora-2-pro',
    });
  }

  // Get user from JWT
  const authHeader = event.headers.authorization;
  let userId: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await sb.auth.getUser(token);

    if (authError || !user) {
      console.error('[ai-video] Auth verification failed', authError);
      return jsonResponse(401, { error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
    }

    userId = user.id;
    console.log('[ai-video] User verified:', userId.substring(0, 8) + '...');
  } else {
    console.error('[ai-video] Missing authorization header');
    return jsonResponse(401, { error: 'UNAUTHORIZED', message: 'Authorization header required' });
  }

  const duration = clipLengthSeconds && clipLengthSeconds > 0 ? clipLengthSeconds : 30;
  const clipStart = clipStartSeconds ?? 0;
  const aspect_ratio = mapAspectRatio(aspectRatio);

  // Map duration to valid OpenAI seconds values (4, 8, 12)
  // For longer durations requested, use the max available (12 seconds)
  let seconds: "4" | "8" | "12" = "8"; // Default to 8 seconds
  if (duration <= 4) {
    seconds = "4";
  } else if (duration <= 8) {
    seconds = "8";
  } else {
    seconds = "12";
  }

  console.log('[ai-video] Creating video with', {
    model: videoModel,
    aspect_ratio,
    duration,
    seconds,
    clipStart,
    hasAudio: !!audioUrl,
  });

  try {
    // Use OpenAI SDK to call Sora 2 video generation API
    // Note: audioUrl and clip timing are stored for reference but not currently supported by the API
    console.log(`[ai-video] Calling OpenAI videos.create with ${videoModel} model`);
    console.log('[ai-video] SDK videos.create exists?', typeof (openai as any)?.videos?.create);

    // Pass aspect_ratio to helper - it will convert to size parameter for OpenAI
    const response = await createSoraVideoJob({
      prompt: prompt,
      model: videoModel,
      seconds: seconds,
      aspect_ratio: aspect_ratio, // Helper converts this to size (720x1280, etc)
    });

    console.log('[ai-video] OpenAI videos.create response:', response);

    // Extract video info from response
    // The response structure should contain video_id and optionally a URL
    const videoId = response.id || null;
    const videoUrl = response.url || null;
    const status = response.status || 'processing';

    if (!videoId) {
      console.error('[ai-video] No video ID in response');
      return jsonResponse(500, {
        error: 'VIDEO_API_ERROR',
        status: 500,
        message: 'OpenAI returned no video ID',
        details: JSON.stringify(response),
      });
    }

    console.log('[ai-video] Video generation initiated', {
      videoId,
      status,
      hasUrl: !!videoUrl,
    });

    // Save to Supabase ai_videos table
    const { data: videoRecord, error: dbError } = await sb
      .from('ai_videos')
      .insert({
        user_id: userId,
        model: videoModel,
        prompt: prompt,
        aspect_ratio: aspect_ratio,
        duration: duration,
        clip_start_seconds: clipStart,
        audio_url: audioUrl,
        video_url: videoUrl,
        openai_video_id: videoId,
        job_id: videoId, // Also store in job_id for compatibility with status endpoint
        status: status === 'completed' || videoUrl ? 'completed' : 'processing',
        openai_response: response,
      })
      .select()
      .single();

    if (dbError) {
      console.error('[ai-video] Failed to save video record', dbError);
      // Don't fail the request if DB save fails
    } else {
      console.log('[ai-video] Saved video record', videoRecord?.id);
    }

    return jsonResponse(200, {
      success: true,
      videoId: videoRecord?.id || videoId,
      openaiVideoId: videoId,
      previewUrl: videoUrl,
      status: status,
      message: status === 'completed'
        ? 'Video generated successfully'
        : 'Video generation in progress. Check status to retrieve the video.',
    });
  } catch (err: any) {
    console.error('[ai-video] Unexpected error', err);

    const errorMessage = err?.message || String(err);
    const errorDetails = err?.response?.data || err?.error || {};
    const errorCode = errorDetails?.code || err?.code;

    // Provide clearer error message for model not found
    let message = 'Failed to create video generation job';
    if (errorCode === 'model_not_found' || errorMessage.includes('model') || errorMessage.includes('not found')) {
      message = 'Video model not available. Make sure `sora-2` is configured and accessible with your OpenAI API key.';
    }

    return jsonResponse(500, {
      error: 'VIDEO_API_ERROR',
      status: 500,
      message,
      details: errorMessage,
      openai_error: errorDetails,
    });
  }
};

export default handler;
