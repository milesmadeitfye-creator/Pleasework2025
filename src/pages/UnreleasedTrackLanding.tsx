import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase.client';
import { Music, Lock, Play, Pause, Eye } from 'lucide-react';
import { getUnreleasedAudioUrl } from '../lib/supabase/getUnreleasedAudioUrl';

interface Track {
  id: string;
  title: string;
  artist_name: string;
  description: string;
  cover_art_url: string;
  file_url: string;
  is_public: boolean;
  plays: number;
}

export default function UnreleasedTrackLanding() {
  const { slug } = useParams<{ slug: string }>();
  const [track, setTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      fetchTrack();
    }
  }, [slug]);

  const fetchTrack = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('unreleased_music')
        .select('*')
        .eq('share_link', slug)
        .maybeSingle();

      if (error || !data) {
        console.error('[UnreleasedTrackLanding] Error fetching track:', error);
        setLoading(false);
        return;
      }

      if (!data.is_public) {
        setPasswordRequired(true);
        setTrack(data);
      } else {
        setTrack(data);
        const url = await getUnreleasedAudioUrl(supabase, data.file_url);

        if (url) {
          setAudioUrl(url);
          console.log('[UnreleasedTrackLanding] Audio URL:', url, 'Track id:', data.id, 'file_url:', data.file_url);
        } else {
          console.error('[UnreleasedTrackLanding] No valid audio URL found for track:', data.id, 'file_url:', data.file_url);
        }
        incrementPlayCount(data.id);
      }
    } catch (err) {
      console.error('[UnreleasedTrackLanding] Unexpected error:', err);
    }
    setLoading(false);
  };


  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!track) return;

    const { data } = await supabase
      .from('unreleased_music')
      .select('password')
      .eq('share_link', slug)
      .maybeSingle();

    if (data && data.password === password) {
      setPasswordRequired(false);
      const url = await getUnreleasedAudioUrl(supabase, track.file_url);

      if (url) {
        setAudioUrl(url);
        console.log('[UnreleasedTrackLanding] Audio URL after password:', url, 'Track id:', track.id, 'file_url:', track.file_url);
      } else {
        console.error('[UnreleasedTrackLanding] No valid audio URL found for track:', track.id, 'file_url:', track.file_url);
      }
      incrementPlayCount(track.id);
      setPasswordError('');
    } else {
      setPasswordError('Incorrect password');
    }
  };

  const incrementPlayCount = async (trackId: string) => {
    await supabase.rpc('increment_unreleased_plays', { track_id: trackId });
  };

  const togglePlayPause = () => {
    const audio = document.getElementById('track-audio') as HTMLAudioElement;
    if (audio) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <Music className="w-24 h-24 text-gray-600 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">Track Not Found</h1>
          <p className="text-gray-400 mb-8">This track may have been removed or the link is invalid.</p>
          <a
            href="https://ghoste.one"
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors inline-block"
          >
            Go to Ghoste
          </a>
        </div>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <Lock className="w-16 h-16 text-purple-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Password Protected</h1>
            <p className="text-gray-400">This track requires a password to access</p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
              {passwordError && (
                <p className="text-red-400 text-sm mt-2">{passwordError}</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
            >
              Unlock Track
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-64 h-64 mb-6 rounded-xl overflow-hidden shadow-2xl">
              {track.cover_art_url ? (
                <img
                  src={track.cover_art_url}
                  alt={track.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                  <Music className="w-32 h-32 text-white opacity-50" />
                </div>
              )}
            </div>

            <h1 className="text-4xl font-bold text-white mb-2">{track.title}</h1>
            <p className="text-2xl text-gray-400 mb-4">{track.artist_name}</p>

            {track.description && (
              <p className="text-gray-400 mb-6 max-w-lg">{track.description}</p>
            )}

            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Eye className="w-4 h-4" />
              <span>{track.plays} plays</span>
            </div>
          </div>

          {audioUrl ? (
            <div className="space-y-4">
              <audio
                id="track-audio"
                src={audioUrl}
                onEnded={() => setIsPlaying(false)}
                onError={() => {
                  console.error('[UnreleasedTrackLanding] Audio playback error');
                }}
                className="hidden"
              />

              <button
                onClick={togglePlayPause}
                className="w-full px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg transform hover:scale-105"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-6 h-6" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-6 h-6" />
                    Play Track
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-full px-8 py-4 bg-red-900/30 border border-red-500/50 text-red-400 font-semibold rounded-xl flex flex-col items-center justify-center gap-2">
                <div className="flex items-center gap-2">
                  <Music className="w-6 h-6" />
                  <span>Audio unavailable. Check storage path.</span>
                </div>
                {track && (
                  <p className="text-red-300 text-xs">file_url: {track.file_url}</p>
                )}
              </div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-gray-700 text-center">
            <p className="text-gray-500 text-sm mb-2">Powered by</p>
            <a
              href="https://ghoste.one"
              className="text-purple-400 hover:text-purple-300 font-semibold text-lg transition-colors"
            >
              Ghoste
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
