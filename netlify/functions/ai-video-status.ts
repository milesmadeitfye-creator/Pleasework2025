import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

/**
 * Polls the status of an AI video generation job and updates database
 */
export const handler: Handler = async (event) => {
  console.log('[ai-video-status] Request received:', event.httpMethod);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    // 1. Verify authentication
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[ai-video-status] Missing auth header');
      return jsonResponse(401, { error: 'MISSING_AUTH' });
    }

    const jwt = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      console.error('[ai-video-status] Auth error:', userError);
      return jsonResponse(401, { error: 'INVALID_USER' });
    }

    // 2. Get video ID from query params
    const aiVideoId = event.queryStringParameters?.id;

    if (!aiVideoId) {
      return jsonResponse(400, { error: 'MISSING_VIDEO_ID' });
    }

    console.log('[ai-video-status] Checking status for video:', aiVideoId);

    // 3. Get video record from database
    const { data: aiVideo, error: fetchError } = await supabase
      .from('ai_videos')
      .select('*')
      .eq('id', aiVideoId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !aiVideo) {
      console.error('[ai-video-status] Video not found:', fetchError);
      return jsonResponse(404, { error: 'VIDEO_NOT_FOUND' });
    }

    if (!aiVideo.job_id) {
      console.error('[ai-video-status] Video has no job_id');
      return jsonResponse(400, { error: 'NO_JOB_ID' });
    }

    // 4. If already completed or failed, just return current state with all fields
    if (aiVideo.status === 'completed' || aiVideo.status === 'failed') {
      return jsonResponse(200, {
        id: aiVideo.id,
        jobId: aiVideo.job_id,
        status: aiVideo.status,
        videoUrl: aiVideo.video_url,
        thumbnailUrl: aiVideo.thumbnail_url,
        prompt: aiVideo.prompt,
        durationSeconds: aiVideo.duration_seconds,
        aspectRatio: aiVideo.aspect_ratio,
        videoType: aiVideo.video_type,
        trackTitle: aiVideo.track_title,
        audioUrl: aiVideo.audio_url,
        referenceVideoUrl: aiVideo.reference_video_url,
        textStyle: aiVideo.text_style,
        lyricsSource: aiVideo.lyrics_source,
        lyricsText: aiVideo.lyrics_text,
        subtitlesJson: aiVideo.subtitles_json,
        errorMessage: aiVideo.error_message,
      });
    }

    console.log('[ai-video-status] Polling OpenAI for job:', aiVideo.job_id);

    // 5. Query OpenAI for latest job status
    let videoJob: any;
    try {
      videoJob = await openai.videos.retrieve(aiVideo.job_id);
      console.log('[ai-video-status] OpenAI job status:', videoJob.status);
    } catch (openaiError: any) {
      console.error('[ai-video-status] OpenAI API error:', openaiError);

      // If OpenAI fails, return current database state
      return jsonResponse(200, {
        id: aiVideo.id,
        jobId: aiVideo.job_id,
        status: aiVideo.status,
        videoUrl: aiVideo.video_url,
        thumbnailUrl: aiVideo.thumbnail_url,
        error: 'OPENAI_API_ERROR',
        message: 'Failed to fetch video status from OpenAI. Please try again.',
      });
    }

    // 6. Update database if status changed
    const updates: any = {};
    let shouldUpdate = false;

    if (videoJob.status !== aiVideo.status) {
      updates.status = videoJob.status;
      shouldUpdate = true;
    }

    // 7. If completed, extract video URL
    if (videoJob.status === 'completed') {
      // The OpenAI SDK returns the video data in different ways depending on the response
      // Check for download_url or url field
      const videoUrl = (videoJob as any).download_url || (videoJob as any).url || null;

      if (videoUrl && videoUrl !== aiVideo.video_url) {
        updates.video_url = videoUrl;
        shouldUpdate = true;
      }

      // Extract thumbnail if available
      const thumbnailUrl = (videoJob as any).thumbnail_url || null;
      if (thumbnailUrl && thumbnailUrl !== aiVideo.thumbnail_url) {
        updates.thumbnail_url = thumbnailUrl;
        shouldUpdate = true;
      }
    }

    // 8. Update database if needed
    if (shouldUpdate) {
      const { error: updateError } = await supabase
        .from('ai_videos')
        .update(updates)
        .eq('id', aiVideo.id);

      if (updateError) {
        console.error('[ai-video-status] Update error:', updateError);
      } else {
        console.log('[ai-video-status] Video record updated');
      }
    }

    // 9. Return updated status with all fields including music metadata
    return jsonResponse(200, {
      id: aiVideo.id,
      jobId: aiVideo.job_id,
      status: updates.status || aiVideo.status,
      videoUrl: updates.video_url || aiVideo.video_url,
      thumbnailUrl: updates.thumbnail_url || aiVideo.thumbnail_url,
      prompt: aiVideo.prompt,
      durationSeconds: aiVideo.duration_seconds,
      aspectRatio: aiVideo.aspect_ratio,
      videoType: aiVideo.video_type,
      trackTitle: aiVideo.track_title,
      audioUrl: aiVideo.audio_url,
      referenceVideoUrl: aiVideo.reference_video_url,
      textStyle: aiVideo.text_style,
      lyricsSource: aiVideo.lyrics_source,
      lyricsText: aiVideo.lyrics_text,
      subtitlesJson: aiVideo.subtitles_json,
      errorMessage: aiVideo.error_message,
    });
  } catch (err: any) {
    console.error('[ai-video-status] Unexpected error:', err);
    return jsonResponse(500, {
      error: 'SERVER_ERROR',
      details: err?.message || String(err),
    });
  }
};
