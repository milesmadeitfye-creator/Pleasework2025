import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Music, Calendar, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';

interface PresaveData {
  id: string;
  slug: string;
  song_title: string;
  artist_name: string;
  release_date: string;
  cover_art_url?: string | null;
  spotify_target_url?: string | null;
}

export default function PreSaveLanding() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PresaveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [presaveSuccess, setPresaveSuccess] = useState(false);
  const [presaveError, setPresaveError] = useState(false);

  useEffect(() => {
    async function fetchPresave() {
      if (!slug) return;

      try {
        const { data: presave, error: fetchError} = await supabase
          .from('presave_links')
          .select('*')
          .eq('slug', slug)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (!presave) {
          setError('Pre-save campaign not found');
        } else {
          setData(presave);
        }
      } catch (err: any) {
        console.error('[SpotifyPresave] Error fetching presave:', err);
        setError(err.message || 'Failed to load pre-save campaign');
      } finally {
        setLoading(false);
      }
    }

    fetchPresave();
  }, [slug]);

  useEffect(() => {
    // Check for Spotify OAuth callback
    const params = new URLSearchParams(window.location.search);
    const spotifyStatus = params.get('spotify');

    if (spotifyStatus === 'success') {
      console.log('[SpotifyPresave] Pre-save successful!');
      setPresaveSuccess(true);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (spotifyStatus === 'error') {
      console.error('[SpotifyPresave] Pre-save failed');
      setPresaveError(true);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleSpotifyPresave = () => {
    if (!slug) return;
    console.log('[SpotifyPresave] Starting Spotify pre-save flow');
    window.location.href = `/.netlify/functions/spotify-auth-start?mode=presave&slug=${encodeURIComponent(slug)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-6">
        <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 rounded-2xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Music className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Not Found</h1>
          <p className="text-gray-400">{error || 'This pre-save campaign does not exist.'}</p>
        </div>
      </div>
    );
  }

  const releaseDate = new Date(data.release_date);
  const formattedDate = releaseDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 rounded-2xl overflow-hidden shadow-2xl">
          {/* Cover Art */}
          {data.cover_art_url && (
            <div className="relative h-96 bg-gray-900">
              <img
                src={data.cover_art_url}
                alt={`${data.song_title} cover art`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent"></div>
            </div>
          )}

          {/* Content */}
          <div className="p-8 md:p-12">
            <div className="flex items-center gap-2 text-pink-400 mb-4">
              <Sparkles className="w-5 h-5" />
              <span className="text-sm font-semibold uppercase tracking-wider">Pre-Save Now</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
              {data.song_title}
            </h1>

            <p className="text-2xl text-gray-300 mb-6">
              {data.artist_name}
            </p>

            <div className="flex items-center gap-2 text-gray-400 mb-8">
              <Calendar className="w-5 h-5" />
              <span>Releases on {formattedDate}</span>
            </div>

            {/* Success/Error Messages */}
            {presaveSuccess && (
              <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-green-400 mb-1">Successfully Pre-Saved!</h3>
                  <p className="text-sm text-gray-300">
                    You'll get this track in your Spotify library as soon as it drops on {formattedDate}. Thanks for your support!
                  </p>
                </div>
              </div>
            )}

            {presaveError && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-400 mb-1">Pre-Save Failed</h3>
                  <p className="text-sm text-gray-300">
                    We couldn't complete your Spotify pre-save. Please try again.
                  </p>
                </div>
              </div>
            )}

            {/* Pre-Save Buttons */}
            <div className="space-y-3">
              {data.spotify_target_url && !presaveSuccess ? (
                <button
                  onClick={handleSpotifyPresave}
                  className="w-full py-4 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold rounded-xl transition-all transform hover:scale-105 flex items-center justify-center gap-2 shadow-lg"
                >
                  <Music className="w-5 h-5" />
                  <span>Pre-Save on Spotify</span>
                </button>
              ) : !data.spotify_target_url && (
                <button className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all transform hover:scale-105 flex items-center justify-center gap-2 shadow-lg">
                  <Music className="w-5 h-5" />
                  <span>Pre-Save on All Platforms</span>
                </button>
              )}

              {presaveSuccess ? (
                <p className="text-sm text-green-400 text-center font-medium">
                  You're all set! We'll notify you when it's out.
                </p>
              ) : (
                <p className="text-sm text-gray-400 text-center">
                  Be the first to hear this track when it drops!
                </p>
              )}
            </div>

            {/* Platform Badges */}
            <div className="mt-8 pt-8 border-t border-gray-700">
              <p className="text-xs text-gray-500 text-center mb-4">
                {data.spotify_target_url ? 'Coming to' : 'Available on'}
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <div className="px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm font-medium">
                  Spotify
                </div>
                <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm font-medium">
                  Apple Music
                </div>
                <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 text-sm font-medium">
                  YouTube Music
                </div>
                <div className="px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-400 text-sm font-medium">
                  More
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Powered by <span className="text-white font-semibold">Ghoste</span>
          </p>
        </div>
      </div>
    </div>
  );
}
