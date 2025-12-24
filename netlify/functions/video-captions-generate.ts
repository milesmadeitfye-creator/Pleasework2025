import type { Handler } from "@netlify/functions";
import { sb } from "./_sb";
import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify(data),
  };
}

/**
 * Converts lyrics or transcript text to SRT format
 * Simple implementation: splits by lines and assigns timestamps
 */
function textToSRT(text: string, durationSeconds: number): string {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    return '';
  }

  // Distribute lines evenly across duration
  const timePerLine = durationSeconds / lines.length;

  let srt = '';
  lines.forEach((line, index) => {
    const startTime = index * timePerLine;
    const endTime = (index + 1) * timePerLine;

    srt += `${index + 1}\n`;
    srt += `${formatSRTTime(startTime)} --> ${formatSRTTime(endTime)}\n`;
    srt += `${line}\n\n`;
  });

  return srt.trim();
}

/**
 * Format seconds to SRT timestamp (HH:MM:SS,mmm)
 */
function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');

  return `${hh}:${mm}:${ss},${mmm}`;
}

/**
 * Transcribe audio to text using OpenAI Whisper
 */
async function transcribeAudio(audioUrl: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  console.log('[video-captions-generate] Fetching audio from URL:', audioUrl);

  // Fetch audio file
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`);
  }

  const audioBlob = await audioResponse.blob();
  const audioFile = new File([audioBlob], 'audio.mp3', { type: 'audio/mpeg' });

  console.log('[video-captions-generate] Transcribing with Whisper...');

  // Transcribe using Whisper
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    language: 'en', // Can be made dynamic
    response_format: 'text',
  });

  console.log('[video-captions-generate] Transcription complete:', transcription.substring(0, 100));

  return transcription;
}

export const handler: Handler = async (event) => {
  console.log('[video-captions-generate] Request received:', event.httpMethod);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  // Validate auth
  const authHeader = event.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'UNAUTHORIZED', message: 'Missing authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await sb.auth.getUser(token);

  if (authError || !user) {
    return jsonResponse(401, { error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }

  // Parse body
  let body: {
    video_id: string;
    lyrics_text?: string;
    audio_url?: string;
    duration_seconds?: number;
    force_transcribe?: boolean;
  };

  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return jsonResponse(400, { error: 'INVALID_JSON' });
  }

  const { video_id, lyrics_text, audio_url, duration_seconds = 8, force_transcribe = false } = body;

  if (!video_id) {
    return jsonResponse(400, { error: 'MISSING_VIDEO_ID' });
  }

  console.log('[video-captions-generate] Processing:', {
    video_id,
    has_lyrics: !!lyrics_text,
    has_audio: !!audio_url,
    force_transcribe,
  });

  try {
    // Fetch video record to verify ownership
    const { data: video, error: videoError } = await sb
      .from('ai_videos')
      .select('*')
      .eq('id', video_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (videoError || !video) {
      return jsonResponse(404, { error: 'VIDEO_NOT_FOUND' });
    }

    let captionText = '';

    // Priority: use lyrics if provided, else transcribe audio
    if (lyrics_text && !force_transcribe) {
      console.log('[video-captions-generate] Using provided lyrics');
      captionText = lyrics_text;
    } else if (audio_url || video.audio_url) {
      console.log('[video-captions-generate] Transcribing audio...');
      const audioToTranscribe = audio_url || video.audio_url;
      captionText = await transcribeAudio(audioToTranscribe);
    } else {
      return jsonResponse(400, {
        error: 'NO_CAPTION_SOURCE',
        message: 'Either lyrics_text or audio_url is required',
      });
    }

    // Convert to SRT
    const srtContent = textToSRT(captionText, duration_seconds);

    if (!srtContent) {
      return jsonResponse(400, {
        error: 'EMPTY_CAPTIONS',
        message: 'Generated captions are empty',
      });
    }

    // Store SRT in Supabase Storage
    const fileName = `${video_id}.srt`;
    const filePath = `captions/${user.id}/${fileName}`;

    console.log('[video-captions-generate] Uploading SRT to storage:', filePath);

    const { data: uploadData, error: uploadError } = await sb.storage
      .from('videos')
      .upload(filePath, srtContent, {
        contentType: 'text/plain',
        upsert: true,
      });

    if (uploadError) {
      console.error('[video-captions-generate] Upload error:', uploadError);
      return jsonResponse(500, {
        error: 'UPLOAD_FAILED',
        message: uploadError.message,
      });
    }

    // Get public URL
    const { data: urlData } = sb.storage
      .from('videos')
      .getPublicUrl(filePath);

    const captionsUrl = urlData.publicUrl;

    console.log('[video-captions-generate] SRT uploaded:', captionsUrl);

    // Update video record with captions URL
    const { error: updateError } = await sb
      .from('ai_videos')
      .update({
        captions_srt_url: captionsUrl,
        lyrics_text: captionText, // Store the text too
        updated_at: new Date().toISOString(),
      })
      .eq('id', video_id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('[video-captions-generate] Update error:', updateError);
      return jsonResponse(500, {
        error: 'UPDATE_FAILED',
        message: updateError.message,
      });
    }

    return jsonResponse(200, {
      ok: true,
      captions_url: captionsUrl,
      captions_text: captionText,
      srt_preview: srtContent.substring(0, 200),
    });
  } catch (err: any) {
    console.error('[video-captions-generate] Error:', err);
    return jsonResponse(500, {
      error: 'GENERATION_FAILED',
      message: err?.message || 'Unknown error',
    });
  }
};
