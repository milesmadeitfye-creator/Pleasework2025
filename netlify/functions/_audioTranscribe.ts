import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export interface TranscriptionResult {
  text: string;
  subtitles?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

/**
 * Transcribes audio from Supabase storage using OpenAI Whisper API
 * Returns full text and optional timestamped subtitles
 */
export async function transcribeFromSupabaseAudio(audioPath: string): Promise<TranscriptionResult> {
  if (!audioPath) {
    throw new Error('Missing audioPath for transcription.');
  }

  console.log('[transcribeFromSupabaseAudio] Starting transcription for:', audioPath);

  try {
    // Ensure we strip any leading "uploads/" if present
    const normalizedPath = audioPath.replace(/^uploads\//, '');

    // Download audio from Supabase storage
    console.log('[transcribeFromSupabaseAudio] Downloading from Supabase storage...');
    const { data, error } = await supabase.storage
      .from('uploads')
      .download(normalizedPath);

    if (error) {
      console.error('[transcribeFromSupabaseAudio] Failed to download audio from Supabase:', error);
      throw new Error('Failed to download audio from storage.');
    }

    // Convert blob to buffer
    const audioBuffer = await data.arrayBuffer();
    const uint8 = new Uint8Array(audioBuffer);

    // Determine file extension from path for proper MIME type
    const ext = audioPath.split('.').pop()?.toLowerCase() || 'mp3';
    const mimeTypes: Record<string, string> = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'm4a': 'audio/mp4',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac',
    };
    const mimeType = mimeTypes[ext] || 'audio/mpeg';

    // Create a File compatible with the OpenAI SDK
    const file = new File([uint8], `audio.${ext}`, { type: mimeType });

    // Transcribe using OpenAI audio transcription (whisper-1 or gpt-4o-mini-transcribe)
    console.log('[transcribeFromSupabaseAudio] Calling OpenAI transcription API...');
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1', // Can also use 'gpt-4o-mini-transcribe' for faster/cheaper transcription
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    console.log('[transcribeFromSupabaseAudio] Transcription successful');

    // Extract text
    const text = transcription.text || '';

    // Extract subtitles if segments are available
    let subtitles: TranscriptionResult['subtitles'];
    if ('segments' in transcription && Array.isArray(transcription.segments)) {
      subtitles = transcription.segments.map((seg: any) => ({
        start: seg.start || 0,
        end: seg.end || 0,
        text: seg.text || '',
      }));
    }

    return {
      text,
      subtitles,
    };
  } catch (error: any) {
    console.error('[transcribeFromSupabaseAudio] Error:', error);
    throw new Error(`Transcription failed: ${error.message}`);
  }
}

/**
 * @deprecated Use transcribeFromSupabaseAudio instead
 * Transcribes audio from a URL using OpenAI Whisper API
 * Returns full text and optional timestamped subtitles
 */
export async function transcribeAudioFromUrl(audioUrl: string): Promise<TranscriptionResult> {
  console.log('[transcribeAudioFromUrl] Starting transcription for:', audioUrl);

  try {
    // Download audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
    }

    const audioBlob = await audioResponse.blob();
    const audioFile = new File([audioBlob], 'audio.mp3', { type: 'audio/mpeg' });

    // Transcribe using OpenAI audio transcription (whisper-1 or gpt-4o-mini-transcribe)
    console.log('[transcribeAudioFromUrl] Calling OpenAI transcription API...');
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1', // Can also use 'gpt-4o-mini-transcribe' for faster/cheaper transcription
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    console.log('[transcribeAudioFromUrl] Transcription successful');

    // Extract text
    const text = transcription.text || '';

    // Extract subtitles if segments are available
    let subtitles: TranscriptionResult['subtitles'];
    if ('segments' in transcription && Array.isArray(transcription.segments)) {
      subtitles = transcription.segments.map((seg: any) => ({
        start: seg.start || 0,
        end: seg.end || 0,
        text: seg.text || '',
      }));
    }

    return {
      text,
      subtitles,
    };
  } catch (error: any) {
    console.error('[transcribeAudioFromUrl] Error:', error);
    throw new Error(`Transcription failed: ${error.message}`);
  }
}
