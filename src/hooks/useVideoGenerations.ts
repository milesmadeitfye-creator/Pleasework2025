import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';

export type VideoGeneration = {
  id: string;
  user_id: string;
  job_id: string | null;
  model: string;
  prompt: string;
  duration_seconds: number;
  aspect_ratio: string;
  platform_tags: string[];
  status: string;
  video_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
};

export function useVideoGenerations() {
  const { user } = useAuth();
  const [current, setCurrent] = useState<VideoGeneration[]>([]);
  const [recent, setRecent] = useState<VideoGeneration[]>([]);
  const [all, setAll] = useState<VideoGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setCurrent([]);
      setRecent([]);
      setAll([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch all user video generations from ai_videos table
      const { data, error: fetchError } = await supabase
        .from('ai_videos')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      const generations = (data || []) as VideoGeneration[];

      // Split into current (processing) and recent (terminal)
      const currentGens = generations.filter(v =>
        v.status === 'queued' || v.status === 'processing'
      );

      const recentGens = generations.filter(v =>
        v.status === 'completed' || v.status === 'failed' || v.status === 'cancelled'
      );

      setCurrent(currentGens);
      setRecent(recentGens);
      setAll(generations);

      console.log('[useVideoGenerations] Loaded:', {
        current: currentGens.length,
        recent: recentGens.length,
        total: generations.length,
      });
    } catch (err: any) {
      console.error('[useVideoGenerations] Refresh error:', err);
      setError(err.message || 'Failed to load video generations');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const upsertGeneration = useCallback(async (payload: Partial<VideoGeneration> & { id?: string }) => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    try {
      if (payload.id) {
        // Update existing
        const { error: updateError } = await supabase
          .from('ai_videos')
          .update(payload)
          .eq('id', payload.id)
          .eq('user_id', user.id);

        if (updateError) throw updateError;
      } else {
        // Insert new
        const { error: insertError } = await supabase
          .from('ai_videos')
          .insert({ ...payload, user_id: user.id });

        if (insertError) throw insertError;
      }

      // Refresh after upsert
      await refresh();
    } catch (err: any) {
      console.error('[useVideoGenerations] Upsert error:', err);
      throw err;
    }
  }, [user?.id, refresh]);

  const updateGeneration = useCallback(async (id: string, patch: Partial<VideoGeneration>) => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    try {
      const { error: updateError } = await supabase
        .from('ai_videos')
        .update(patch)
        .eq('id', id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Refresh after update
      await refresh();
    } catch (err: any) {
      console.error('[useVideoGenerations] Update error:', err);
      throw err;
    }
  }, [user?.id, refresh]);

  const getGenerationById = useCallback((id: string): VideoGeneration | null => {
    return all.find(v => v.id === id) || null;
  }, [all]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    console.log('[useVideoGenerations] Setting up realtime subscription');

    const channelName = `ai_videos_${user.id}`;
    const channel = supabase.channel(channelName);

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_videos',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useVideoGenerations] Realtime change:', payload.eventType);
          refresh();
        }
      )
      .subscribe((status) => {
        console.log('[useVideoGenerations] Subscription status:', status);
        if (status === 'CHANNEL_ERROR') {
          console.warn('[useVideoGenerations] Channel error');
        }
        if (status === 'TIMED_OUT') {
          console.warn('[useVideoGenerations] Channel timed out');
        }
      });

    return () => {
      console.log('[useVideoGenerations] Cleaning up realtime subscription');
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        console.warn('[useVideoGenerations] Cleanup error:', e);
      }
    };
  }, [user?.id, refresh]);

  return {
    current,
    recent,
    all,
    loading,
    error,
    refresh,
    upsertGeneration,
    updateGeneration,
    getGenerationById,
  };
}
