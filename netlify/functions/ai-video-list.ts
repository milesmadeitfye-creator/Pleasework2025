import type { Handler } from '@netlify/functions';
import { json, cors } from './_shared/response';
import { supabaseAdmin } from './_supabaseAdmin';
import { getUserFromAuthHeader } from './_shared/auth';

/**
 * Lists all video generations for the authenticated user
 * Used by frontend to populate Current and Recent tabs
 *
 * IMPORTANT: This queries video_generations table (not ai_videos)
 * to match what the UI expects via useVideoGenerations hook
 */
export const handler: Handler = async (event) => {
  console.log('[ai-video-list] Request received:', event.httpMethod);

  if (event.httpMethod === 'OPTIONS') return cors();

  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const user = await getUserFromAuthHeader(event.headers.authorization);
    if (!user) {
      console.error('[ai-video-list] Auth failed');
      return json(401, { ok: false, error: 'Unauthorized' });
    }

    console.log('[ai-video-list] Fetching video_generations for user:', user.id.substring(0, 8) + '...');

    // Query video_generations table (matches UI expectation)
    const { data: videos, error: fetchError } = await supabaseAdmin
      .from('video_generations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('[ai-video-list] DB error:', fetchError);
      return json(500, {
        ok: false,
        error: fetchError.message,
        code: fetchError.code,
      });
    }

    console.log('[ai-video-list] Found', videos?.length || 0, 'videos');

    // Split into current (processing) and recent (terminal)
    const current = (videos || []).filter(v =>
      v.status === "queued" || v.status === "processing"
    );

    const recent = (videos || []).filter(v =>
      v.status === "completed" || v.status === "failed" || v.status === "cancelled"
    );

    console.log('[ai-video-list] Split:', {
      current: current.length,
      recent: recent.length,
    });

    return json(200, {
      ok: true,
      total: videos?.length || 0,
      current: current.length,
      recent: recent.length,
      videos: {
        current,
        recent,
        all: videos || [],
      },
    });
  } catch (err: any) {
    console.error('[ai-video-list] Error:', err);
    return json(500, {
      ok: false,
      error: err.message || 'Unknown error',
    });
  }
};

export default handler;
